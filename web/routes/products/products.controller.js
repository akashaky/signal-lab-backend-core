import express from "express";
import validateJWT from "../../middleware/validateUserToken.js";
import KnexClient from "../../knex.js";

const router = express.Router();

async function getStoreId(shop) {
  const store = await KnexClient("shopifyStore")
    .where("myshopifyDomain", shop)
    .first("id");
  return store?.id ?? null;
}

// GET /api/products
// Returns all products (grouped by productShopifyId) with variants and COGS overrides
router.get("/", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const storeId = await getStoreId(shop);
    if (!storeId) return res.status(404).json({ error: "Store not found" });

    const settings = await KnexClient("storeSettings").where("storeId", storeId).first();
    const defaultCogsPercent = settings ? parseFloat(settings.cogsPercent) : 30;

    const variants = await KnexClient("productVariants")
      .where("productVariants.storeId", storeId)
      .leftJoin("productVariantCogs", function () {
        this.on("productVariantCogs.variantShopifyId", "=", "productVariants.variantShopifyId")
          .andOn("productVariantCogs.storeId", "=", "productVariants.storeId");
      })
      .select(
        "productVariants.id",
        "productVariants.variantShopifyId",
        "productVariants.productShopifyId",
        "productVariants.productTitle",
        "productVariants.productHandle",
        "productVariants.productStatus",
        "productVariants.variantTitle",
        "productVariants.price",
        "productVariants.sku",
        "productVariants.inventoryQuantity",
        "productVariantCogs.cogsPercent as cogsOverride"
      )
      .orderBy("productVariants.productTitle")
      .orderBy("productVariants.price");

    // Group variants by product
    const productMap = new Map();
    for (const row of variants) {
      if (!productMap.has(row.productShopifyId)) {
        productMap.set(row.productShopifyId, {
          productShopifyId: row.productShopifyId,
          productTitle: row.productTitle,
          productHandle: row.productHandle,
          productStatus: row.productStatus,
          variants: [],
        });
      }
      productMap.get(row.productShopifyId).variants.push({
        variantShopifyId: row.variantShopifyId,
        variantTitle: row.variantTitle,
        price: row.price,
        sku: row.sku ?? null,
        inventoryQuantity: row.inventoryQuantity,
        cogsPercent: row.cogsOverride != null ? parseFloat(row.cogsOverride) : null,
      });
    }

    return res.json({
      products: Array.from(productMap.values()),
      defaultCogsPercent,
    });
  } catch (err) {
    console.error("Error in GET /products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/products/cogs
// Upsert COGS override for a variant: { variantShopifyId, cogsPercent }
router.post("/cogs", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { variantShopifyId, cogsPercent } = req.body;

    if (!variantShopifyId || cogsPercent == null) {
      return res.status(400).json({ error: "variantShopifyId and cogsPercent are required" });
    }

    const storeId = await getStoreId(shop);
    if (!storeId) return res.status(404).json({ error: "Store not found" });

    const pct = parseFloat(cogsPercent);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "cogsPercent must be between 0 and 100" });
    }

    const existing = await KnexClient("productVariantCogs")
      .where({ variantShopifyId, storeId })
      .first();

    if (existing) {
      await KnexClient("productVariantCogs")
        .where({ variantShopifyId, storeId })
        .update({ cogsPercent: pct });
    } else {
      await KnexClient("productVariantCogs").insert({ variantShopifyId, storeId, cogsPercent: pct });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /products/cogs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/products/cogs/:variantShopifyId
// Remove COGS override for a variant (revert to store default)
router.delete("/cogs/:variantShopifyId", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;
    const { variantShopifyId } = req.params;

    const storeId = await getStoreId(shop);
    if (!storeId) return res.status(404).json({ error: "Store not found" });

    await KnexClient("productVariantCogs")
      .where({ variantShopifyId, storeId })
      .delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in DELETE /products/cogs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
