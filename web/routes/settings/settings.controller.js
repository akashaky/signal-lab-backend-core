import express from "express";
import validateJWT from "../../middleware/validateUserToken.js";
import KnexClient from "../../knex.js";

const router = express.Router();

async function getStore(shop) {
  return KnexClient("shopifyStore").where("myshopifyDomain", shop).first();
}

function toDateStr(ym, lastDay = false) {
  if (!ym) return null;
  if (lastDay) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0).toISOString().slice(0, 10);
  }
  return ym + "-01";
}

function toMonthStr(dateVal) {
  if (!dateVal) return null;
  const s = dateVal instanceof Date ? dateVal.toISOString() : String(dateVal);
  return s.slice(0, 7);
}

// GET /api/settings
router.get("/", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const store = await getStore(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const [settings, history] = await Promise.all([
      KnexClient("storeSettings").where("storeId", store.id).first(),
      KnexClient("storeCostHistory").where("storeId", store.id).orderBy("startDate", "desc"),
    ]);

    return res.json({
      avgShipping: settings ? parseFloat(settings.avgShipping) : 4.50,
      dailyAdSpend: settings ? parseFloat(settings.dailyAdSpend || 0) : 0,
      history: history.map((h) => ({
        id: h.id,
        startDate: toMonthStr(h.startDate),
        endDate: toMonthStr(h.endDate),
        avgShipping: parseFloat(h.avgShipping),
        dailyAdSpend: parseFloat(h.dailyAdSpend),
      })),
    });
  } catch (err) {
    console.error("Error in GET /settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/settings
router.put("/", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const store = await getStore(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { avgShipping, dailyAdSpend } = req.body;
    await KnexClient("storeSettings").where("storeId", store.id).update({
      avgShipping: parseFloat(avgShipping) || 4.50,
      dailyAdSpend: parseFloat(dailyAdSpend) || 0,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in PUT /settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/settings/history
router.post("/history", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const store = await getStore(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { startDate, endDate, avgShipping, dailyAdSpend } = req.body;
    if (!startDate || avgShipping == null || dailyAdSpend == null) {
      return res.status(400).json({ error: "startDate, avgShipping, and dailyAdSpend are required" });
    }

    const [id] = await KnexClient("storeCostHistory").insert({
      storeId: store.id,
      startDate: toDateStr(startDate, false),
      endDate: toDateStr(endDate, true),
      avgShipping: parseFloat(avgShipping),
      dailyAdSpend: parseFloat(dailyAdSpend),
    });

    return res.json({ id });
  } catch (err) {
    console.error("Error in POST /settings/history:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/settings/history/:id
router.put("/history/:id", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const store = await getStore(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const { startDate, endDate, avgShipping, dailyAdSpend } = req.body;
    await KnexClient("storeCostHistory")
      .where({ id: req.params.id, storeId: store.id })
      .update({
        startDate: toDateStr(startDate, false),
        endDate: toDateStr(endDate, true),
        avgShipping: parseFloat(avgShipping),
        dailyAdSpend: parseFloat(dailyAdSpend),
      });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in PUT /settings/history/:id:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/settings/history/:id
router.delete("/history/:id", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const store = await getStore(shop);
    if (!store) return res.status(404).json({ error: "Store not found" });

    await KnexClient("storeCostHistory")
      .where({ id: req.params.id, storeId: store.id })
      .delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in DELETE /settings/history/:id:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
