import express from "express";
import axios from "axios";
import validateJWT from "../../middleware/validateUserToken.js";
import KnexClient from "../../knex.js";

const router = express.Router();

async function fetchShopifyBulkOperationData(shop, accessToken, bulkOperationShopifyId) {
  try {
    const query = `
      query {
        node(id: "${bulkOperationShopifyId}") {
          ... on BulkOperation {
            id
            status
            objectCount
          }
        }
      }
    `;
    const response = await axios.post(
      `https://${shop}/admin/api/2025-01/graphql.json`,
      { query },
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    const node = response.data?.data?.node;
    if (!node) return null;
    return {
      status: node.status,
      objectCount: node.objectCount != null ? parseInt(node.objectCount) : null,
    };
  } catch (err) {
    console.error("Failed to fetch bulk op from Shopify:", err?.response?.data || err.message);
    return null;
  }
}

// GET /api/onboarding/status
router.get("/status", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    const settings = await KnexClient("storeSettings")
      .where("storeId", store.id)
      .first();

    const operations = await KnexClient("shopifyBulkOperation")
      .where("storeId", store.id)
      .whereIn("type", ["PRODUCTS_IMPORT", "CUSTOMERS_IMPORT", "ORDERS_IMPORT"])
      .orderBy("id", "desc");

    // Keep only the latest record per type
    const latestByType = {};
    for (const op of operations) {
      if (!latestByType[op.type]) latestByType[op.type] = op;
    }

    const accessTokenRecord = await KnexClient("accessToken")
      .where("storeId", store.id)
      .first();
    const shopifyToken = accessTokenRecord?.offlineToken;

    const syncStatus = {};
    for (const type of ["PRODUCTS_IMPORT", "CUSTOMERS_IMPORT", "ORDERS_IMPORT"]) {
      const op = latestByType[type];
      if (!op) {
        syncStatus[type] = { status: null, objectCount: null };
        continue;
      }

      let { status, objectCount } = op;

      // For active operations, fetch fresh data from Shopify
      if (shopifyToken && (status === "CREATED" || status === "PROCESSING")) {
        const fresh = await fetchShopifyBulkOperationData(
          shop,
          shopifyToken,
          op.bulkOperationShopifyId
        );
        if (fresh) {
          status = fresh.status || status;
          objectCount = fresh.objectCount ?? objectCount;
          await KnexClient("shopifyBulkOperation")
            .where("id", op.id)
            .update({ status, objectCount });
        }
      }

      syncStatus[type] = { status, objectCount: objectCount ?? null };
    }

    return res.json({
      isOnboarded: !!store.isOnboarded,
      settings: settings
        ? {
            cogsPercent: parseFloat(settings.cogsPercent),
            avgShipping: parseFloat(settings.avgShipping),
            processingFee: settings.processingFee,
            customFeePercent: settings.customFeePercent != null ? parseFloat(settings.customFeePercent) : null,
            fixedFeeCents: settings.fixedFeeCents,
            dailyAdSpend: settings.dailyAdSpend != null ? parseFloat(settings.dailyAdSpend) : null,
          }
        : null,
      sync: {
        products: syncStatus["PRODUCTS_IMPORT"],
        customers: syncStatus["CUSTOMERS_IMPORT"],
        orders: syncStatus["ORDERS_IMPORT"],
      },
    });
  } catch (err) {
    console.error("Error in GET /onboarding/status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/onboarding/settings
router.post("/settings", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { cogsPercent, avgShipping, processingFee, customFeePercent, fixedFeeCents, dailyAdSpend } = req.body;

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    const data = {
      cogsPercent: parseFloat(cogsPercent) || 30,
      avgShipping: parseFloat(avgShipping) || 4.5,
      processingFee: processingFee || "shopify_standard",
      customFeePercent: customFeePercent != null && customFeePercent !== "" ? parseFloat(customFeePercent) : null,
      fixedFeeCents: parseInt(fixedFeeCents) || 30,
      dailyAdSpend: dailyAdSpend != null && dailyAdSpend !== "" ? parseFloat(dailyAdSpend) : null,
    };

    const existing = await KnexClient("storeSettings")
      .where("storeId", store.id)
      .first();

    if (existing) {
      await KnexClient("storeSettings").where("storeId", store.id).update(data);
    } else {
      await KnexClient("storeSettings").insert({ storeId: store.id, ...data });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /onboarding/settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/onboarding/complete
router.post("/complete", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;

    await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .update({ isOnboarded: 1 });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /onboarding/complete:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
