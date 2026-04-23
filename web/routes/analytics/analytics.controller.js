import express from "express";
import validateJWT from "../../middleware/validateUserToken.js";
import KnexClient from "../../knex.js";

const router = express.Router();

async function getStoreAndSettings(shop) {
  const store = await KnexClient("shopifyStore")
    .where("myshopifyDomain", shop)
    .first();
  if (!store) return { store: null, settings: null };
  const settings = await KnexClient("storeSettings")
    .where("storeId", store.id)
    .first();
  return { store, settings };
}

function getCustomDateRanges(startStr, endStr) {
  // end is inclusive (user picks e.g. Apr 1–Apr 7), so push end to next day midnight
  const start = new Date(startStr + "T00:00:00.000Z");
  const end   = new Date(endStr   + "T00:00:00.000Z");
  end.setUTCDate(end.getUTCDate() + 1); // make end exclusive

  const periodMs   = end - start;
  const periodDays = Math.round(periodMs / 86400000);
  const priorEnd   = new Date(start);
  const priorStart = new Date(start.getTime() - periodMs);

  const chartGranularity = periodDays > 60 ? "3day" : "day";
  const chartBuckets     = chartGranularity === "3day" ? 30 : Math.min(periodDays, 90);

  return { start, end, priorStart, priorEnd, chartStart: start, chartEnd: end, periodDays, chartGranularity, chartBuckets };
}

function getDateRanges(period) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today": {
      const start = todayStart;
      const end = new Date(todayStart.getTime() + 86400000);
      const priorStart = new Date(todayStart.getTime() - 86400000);
      const priorEnd = todayStart;
      // Chart shows last 7 days as context
      const chartStart = new Date(todayStart.getTime() - 6 * 86400000);
      return { start, end, priorStart, priorEnd, chartStart, chartEnd: end, periodDays: 1, chartGranularity: "day" };
    }
    case "this_week": {
      const dayOfWeek = todayStart.getDay();
      const start = new Date(todayStart.getTime() - dayOfWeek * 86400000);
      const end = new Date(todayStart.getTime() + 86400000);
      const priorStart = new Date(start.getTime() - 7 * 86400000);
      const priorEnd = start;
      return { start, end, priorStart, priorEnd, chartStart: start, chartEnd: end, periodDays: dayOfWeek + 1, chartGranularity: "day" };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(todayStart.getTime() + 86400000);
      const priorStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const priorEnd = start;
      const periodDays = now.getDate();
      return { start, end, priorStart, priorEnd, chartStart: start, chartEnd: end, periodDays, chartGranularity: "day" };
    }
    case "last_90_days": {
      const start = new Date(todayStart.getTime() - 90 * 86400000);
      const end = new Date(todayStart.getTime() + 86400000);
      const priorStart = new Date(start.getTime() - 90 * 86400000);
      const priorEnd = start;
      return { start, end, priorStart, priorEnd, chartStart: start, chartEnd: end, periodDays: 90, chartGranularity: "3day" };
    }
    default: {
      // last_30_days
      const start = new Date(todayStart.getTime() - 30 * 86400000);
      const end = new Date(todayStart.getTime() + 86400000);
      const priorStart = new Date(start.getTime() - 30 * 86400000);
      const priorEnd = start;
      return { start, end, priorStart, priorEnd, chartStart: start, chartEnd: end, periodDays: 30, chartGranularity: "day" };
    }
  }
}

// ── Shared query helpers ────────────────────────────────────────────────────

async function queryRevenue(storeId, start, end) {
  const [rows] = await KnexClient.raw(
    `SELECT
       COALESCE(SUM(order_total), 0)                             AS grossRevenue,
       COALESCE(SUM(GREATEST(item_gross - order_subtotal, 0)), 0) AS discounts,
       COUNT(*)                                                   AS orderCount
     FROM (
       SELECT
         orderShopifyId,
         MAX(CAST(totalPrice    AS DECIMAL(12,2))) AS order_total,
         MAX(CAST(subtotalPrice AS DECIMAL(12,2))) AS order_subtotal,
         SUM(CAST(unitPrice     AS DECIMAL(12,2)) * quantity)    AS item_gross
       FROM shopifyOrderLineItems
       WHERE storeId = ?
         AND orderCreatedAt >= ?
         AND orderCreatedAt < ?
         AND cancelledAt IS NULL
         AND (financialStatus IS NULL OR financialStatus NOT IN ('voided'))
       GROUP BY orderShopifyId
     ) AS o`,
    [storeId, start, end]
  );
  return {
    grossRevenue: parseFloat(rows[0]?.grossRevenue ?? 0),
    discounts: parseFloat(rows[0]?.discounts ?? 0),
    orderCount: parseInt(rows[0]?.orderCount ?? 0),
  };
}

async function queryRefunds(storeId, start, end) {
  const [rows] = await KnexClient.raw(
    `SELECT COALESCE(SUM(CAST(totalRefunded AS DECIMAL(12,2))), 0) AS totalRefunds
     FROM shopifyRefunds
     WHERE storeId = ? AND processedAt >= ? AND processedAt < ?`,
    [storeId, start, end]
  );
  return parseFloat(rows[0]?.totalRefunds ?? 0);
}

async function queryCustomers(storeId, start, end) {
  const [newRows] = await KnexClient.raw(
    `SELECT COUNT(*) AS newCustomers FROM (
       SELECT customerShopifyId, MIN(orderCreatedAt) AS firstOrder
       FROM shopifyOrderLineItems
       WHERE storeId = ? AND customerShopifyId IS NOT NULL AND cancelledAt IS NULL
       GROUP BY customerShopifyId
       HAVING firstOrder >= ? AND firstOrder < ?
     ) sub`,
    [storeId, start, end]
  );

  const [retRows] = await KnexClient.raw(
    `SELECT COUNT(DISTINCT cur.customerShopifyId) AS returningCustomers
     FROM (
       SELECT DISTINCT customerShopifyId
       FROM shopifyOrderLineItems
       WHERE storeId = ? AND customerShopifyId IS NOT NULL
         AND orderCreatedAt >= ? AND orderCreatedAt < ? AND cancelledAt IS NULL
     ) cur
     WHERE EXISTS (
       SELECT 1 FROM shopifyOrderLineItems prev
       WHERE prev.storeId = ? AND prev.customerShopifyId = cur.customerShopifyId
         AND prev.orderCreatedAt < ? AND prev.cancelledAt IS NULL
     )`,
    [storeId, start, end, storeId, start]
  );

  const [repeatRows] = await KnexClient.raw(
    `SELECT
       COUNT(DISTINCT customerShopifyId)                                          AS totalCustomers,
       SUM(CASE WHEN orderCount > 1 THEN 1 ELSE 0 END)                           AS repeatCustomers
     FROM (
       SELECT customerShopifyId, COUNT(DISTINCT orderShopifyId) AS orderCount
       FROM shopifyOrderLineItems
       WHERE storeId = ? AND customerShopifyId IS NOT NULL
         AND orderCreatedAt >= ? AND orderCreatedAt < ? AND cancelledAt IS NULL
       GROUP BY customerShopifyId
     ) sub`,
    [storeId, start, end]
  );

  const [refundRateRows] = await KnexClient.raw(
    `SELECT
       COUNT(DISTINCT orderShopifyId) AS totalOrders,
       COUNT(DISTINCT CASE WHEN financialStatus IN ('refunded','partially_refunded') THEN orderShopifyId END) AS refundedOrders
     FROM shopifyOrderLineItems
     WHERE storeId = ? AND orderCreatedAt >= ? AND orderCreatedAt < ? AND cancelledAt IS NULL`,
    [storeId, start, end]
  );

  const newCustomers = parseInt(newRows[0]?.newCustomers ?? 0);
  const returningCustomers = parseInt(retRows[0]?.returningCustomers ?? 0);
  const totalCustomers = parseInt(repeatRows[0]?.totalCustomers ?? 0);
  const repeatCustomers = parseInt(repeatRows[0]?.repeatCustomers ?? 0);
  const repeatRate = totalCustomers > 0
    ? parseFloat(((repeatCustomers / totalCustomers) * 100).toFixed(1))
    : 0;
  const totalOrders = parseInt(refundRateRows[0]?.totalOrders ?? 0);
  const refundedOrders = parseInt(refundRateRows[0]?.refundedOrders ?? 0);
  const refundRate = totalOrders > 0
    ? parseFloat(((refundedOrders / totalOrders) * 100).toFixed(1))
    : 0;

  return { newCustomers, returningCustomers, repeatRate, refundRate };
}

async function queryChartData(storeId, chartStart, chartEnd, chartGranularity, settings) {
  const [revRows] = await KnexClient.raw(
    `SELECT
       DATE(orderCreatedAt) AS day,
       COALESCE(SUM(order_total), 0)                             AS dailyRevenue,
       COALESCE(SUM(GREATEST(item_gross - order_subtotal, 0)), 0) AS dailyDiscounts,
       COUNT(*)                                                   AS dailyOrders
     FROM (
       SELECT
         orderShopifyId,
         orderCreatedAt,
         MAX(CAST(totalPrice    AS DECIMAL(12,2))) AS order_total,
         MAX(CAST(subtotalPrice AS DECIMAL(12,2))) AS order_subtotal,
         SUM(CAST(unitPrice     AS DECIMAL(12,2)) * quantity)    AS item_gross
       FROM shopifyOrderLineItems
       WHERE storeId = ?
         AND orderCreatedAt >= ? AND orderCreatedAt < ?
         AND cancelledAt IS NULL
         AND (financialStatus IS NULL OR financialStatus NOT IN ('voided'))
       GROUP BY orderShopifyId, DATE(orderCreatedAt)
     ) daily
     GROUP BY DATE(orderCreatedAt)
     ORDER BY day ASC`,
    [storeId, chartStart, chartEnd]
  );

  const [refRows] = await KnexClient.raw(
    `SELECT DATE(processedAt) AS day, SUM(CAST(totalRefunded AS DECIMAL(12,2))) AS dailyRefunds
     FROM shopifyRefunds
     WHERE storeId = ? AND processedAt >= ? AND processedAt < ?
     GROUP BY DATE(processedAt)`,
    [storeId, chartStart, chartEnd]
  );

  const cogsPct = settings ? parseFloat(settings.cogsPercent) / 100 : 0.30;
  const avgShipping = settings ? parseFloat(settings.avgShipping) : 4.50;
  const dailyAdSpend = settings?.dailyAdSpend ? parseFloat(settings.dailyAdSpend) : 0;

  const revByDay = new Map();
  for (const r of revRows) {
    const key = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day);
    revByDay.set(key, {
      revenue: parseFloat(r.dailyRevenue),
      discounts: parseFloat(r.dailyDiscounts ?? 0),
      orders: parseInt(r.dailyOrders),
    });
  }

  const refByDay = new Map();
  for (const r of refRows) {
    const key = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day);
    refByDay.set(key, parseFloat(r.dailyRefunds ?? 0));
  }

  const chartDates = [];
  const chartRevenue = [];
  const chartProfit = [];

  const totalMs = chartEnd - chartStart;
  const bucketCount = chartGranularity === "3day" ? 30 : Math.round(totalMs / 86400000);
  const bucketDays = chartGranularity === "3day" ? 3 : 1;

  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = new Date(chartStart.getTime() + i * bucketDays * 86400000);

    let bRevenue = 0, bDiscounts = 0, bRefunds = 0, bOrders = 0;
    for (let d = 0; d < bucketDays; d++) {
      const dayKey = new Date(bucketStart.getTime() + d * 86400000)
        .toISOString()
        .slice(0, 10);
      const day = revByDay.get(dayKey) ?? { revenue: 0, discounts: 0, orders: 0 };
      bRevenue += day.revenue;
      bDiscounts += day.discounts;
      bRefunds += refByDay.get(dayKey) ?? 0;
      bOrders += day.orders;
    }

    let label;
    if (chartGranularity === "3day") {
      const bucketEndDate = new Date(bucketStart.getTime() + (bucketDays - 1) * 86400000);
      label =
        bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        "–" +
        bucketEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      label = bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    const netRevenue = bRevenue - bDiscounts - bRefunds;
    const cogs = netRevenue * cogsPct;
    const shipping = bOrders * avgShipping;
    const adSpend = dailyAdSpend * bucketDays;
    const profit = Math.round(netRevenue - cogs - shipping - adSpend);

    chartDates.push(label);
    chartRevenue.push(Math.round(bRevenue));
    chartProfit.push(profit);
  }

  return { chartDates, chartRevenue, chartProfit };
}

// Resolves date ranges from either ?start=&end= (custom) or ?period= (preset)
function resolveRanges(query) {
  if (query.start && query.end) {
    return getCustomDateRanges(query.start, query.end);
  }
  return getDateRanges(query.period ?? "last_30_days");
}

// ── GET /api/analytics/pnl?period= | ?start=&end= ──────────────────────────
// Powers: PnLBlock
router.get("/pnl", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { store, settings } = await getStoreAndSettings(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { start, end, priorStart, priorEnd, periodDays } = resolveRanges(req.query);
    const dailyAdSpend = settings?.dailyAdSpend ? parseFloat(settings.dailyAdSpend) : 0;

    const [current, prior, refunds, refundsPrior] = await Promise.all([
      queryRevenue(store.id, start, end),
      queryRevenue(store.id, priorStart, priorEnd),
      queryRefunds(store.id, start, end),
      queryRefunds(store.id, priorStart, priorEnd),
    ]);

    return res.json({
      grossRevenue: current.grossRevenue,
      grossRevenuePrior: prior.grossRevenue,
      discounts: current.discounts,
      discountsPrior: prior.discounts,
      refunds,
      refundsPrior,
      adSpend: dailyAdSpend * periodDays,
      orders: current.orderCount,
    });
  } catch (err) {
    console.error("Error in GET /analytics/pnl:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/analytics/kpis?period= | ?start=&end= ─────────────────────────
// Powers: KpiCards
router.get("/kpis", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { store } = await getStoreAndSettings(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { start, end, priorStart, priorEnd } = resolveRanges(req.query);

    const [current, customersPrior, currentRev, priorRev, refunds] = await Promise.all([
      queryCustomers(store.id, start, end),
      queryCustomers(store.id, priorStart, priorEnd),
      queryRevenue(store.id, start, end),
      queryRevenue(store.id, priorStart, priorEnd),
      queryRefunds(store.id, start, end),
    ]);

    return res.json({
      orders: currentRev.orderCount,
      ordersPrior: priorRev.orderCount,
      grossRevenue: currentRev.grossRevenue,
      grossRevenuePrior: priorRev.grossRevenue,
      discounts: currentRev.discounts,
      refunds,
      newCustomers: current.newCustomers,
      newCustomersPrior: customersPrior.newCustomers,
      returningCustomers: current.returningCustomers,
      returningCustomersPrior: customersPrior.returningCustomers,
      repeatRate: current.repeatRate,
      repeatRatePrior: customersPrior.repeatRate,
      refundRate: current.refundRate,
      refundRatePrior: customersPrior.refundRate,
    });
  } catch (err) {
    console.error("Error in GET /analytics/kpis:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/analytics/chart?period= | ?start=&end= ────────────────────────
// Powers: RevenueChart
router.get("/chart", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { store, settings } = await getStoreAndSettings(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { chartStart, chartEnd, chartGranularity } = resolveRanges(req.query);
    const chart = await queryChartData(store.id, chartStart, chartEnd, chartGranularity, settings);

    return res.json(chart);
  } catch (err) {
    console.error("Error in GET /analytics/chart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/analytics/home?period= | ?start=&end= ─────────────────────────
// Combined endpoint — all three components in one request
router.get("/home", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { store, settings } = await getStoreAndSettings(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { start, end, priorStart, priorEnd, chartStart, chartEnd, periodDays, chartGranularity } =
      resolveRanges(req.query);

    const dailyAdSpend = settings?.dailyAdSpend ? parseFloat(settings.dailyAdSpend) : 0;

    const [currentRev, priorRev, refunds, customers, customersPrior, chart] =
      await Promise.all([
        queryRevenue(store.id, start, end),
        queryRevenue(store.id, priorStart, priorEnd),
        queryRefunds(store.id, start, end),
        queryCustomers(store.id, start, end),
        queryCustomers(store.id, priorStart, priorEnd),
        queryChartData(store.id, chartStart, chartEnd, chartGranularity, settings),
      ]);

    return res.json({
      grossRevenue: currentRev.grossRevenue,
      grossRevenuePrior: priorRev.grossRevenue,
      discounts: currentRev.discounts,
      refunds,
      adSpend: dailyAdSpend * periodDays,
      orders: currentRev.orderCount,
      ordersPrior: priorRev.orderCount,
      newCustomers: customers.newCustomers,
      newCustomersPrior: customersPrior.newCustomers,
      returningCustomers: customers.returningCustomers,
      returningCustomersPrior: customersPrior.returningCustomers,
      repeatRate: customers.repeatRate,
      repeatRatePrior: customersPrior.repeatRate,
      refundRate: customers.refundRate,
      refundRatePrior: customersPrior.refundRate,
      chartDates: chart.chartDates,
      chartRevenue: chart.chartRevenue,
      chartProfit: chart.chartProfit,
    });
  } catch (err) {
    console.error("Error in GET /analytics/home:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
