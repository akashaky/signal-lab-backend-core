import KnexClient from "../knex.js";
import { runBillingSetup } from "./billing-setup.js";

export async function runDbSetup() {
  try {
    const hasObjectCount = await KnexClient.schema.hasColumn("shopifyBulkOperation", "objectCount");
    if (!hasObjectCount) {
      await KnexClient.schema.alterTable("shopifyBulkOperation", (table) => {
        table.bigInteger("objectCount").nullable();
      });
      console.log("✅ Added objectCount to shopifyBulkOperation");
    }

    const hasIsOnboarded = await KnexClient.schema.hasColumn("shopifyStore", "isOnboarded");
    if (!hasIsOnboarded) {
      await KnexClient.schema.alterTable("shopifyStore", (table) => {
        table.tinyint("isOnboarded").defaultTo(0).notNullable();
      });
      console.log("✅ Added isOnboarded to shopifyStore");
    }

    const hasStoreSettings = await KnexClient.schema.hasTable("storeSettings");
    if (!hasStoreSettings) {
      await KnexClient.schema.createTable("storeSettings", (table) => {
        table.increments("id").primary();
        table.integer("storeId").unsigned().notNullable();
        table.foreign("storeId").references("id").inTable("shopifyStore");
        table.decimal("cogsPercent", 5, 2).notNullable().defaultTo(30);
        table.decimal("avgShipping", 8, 2).notNullable().defaultTo(4.5);
        table.string("processingFee", 50).notNullable().defaultTo("shopify_standard");
        table.decimal("customFeePercent", 5, 2).nullable();
        table.integer("fixedFeeCents").notNullable().defaultTo(30);
        table.decimal("dailyAdSpend", 10, 2).nullable();
        table.timestamps(true, true);
      });
      console.log("✅ Created storeSettings table");
    }

    const hasVariantCogs = await KnexClient.schema.hasTable("productVariantCogs");
    if (!hasVariantCogs) {
      await KnexClient.schema.createTable("productVariantCogs", (table) => {
        table.increments("id").primary();
        table.string("variantShopifyId", 255).notNullable();
        table.integer("storeId").unsigned().notNullable();
        table.foreign("storeId").references("id").inTable("shopifyStore");
        table.decimal("cogsPercent", 5, 2).notNullable();
        table.timestamps(true, true);
        table.unique(["variantShopifyId", "storeId"]);
      });
      console.log("✅ Created productVariantCogs table");
    }

    const hasCostHistory = await KnexClient.schema.hasTable("storeCostHistory");
    if (!hasCostHistory) {
      await KnexClient.schema.createTable("storeCostHistory", (table) => {
        table.increments("id").primary();
        table.integer("storeId").unsigned().notNullable();
        table.foreign("storeId").references("id").inTable("shopifyStore");
        table.date("startDate").notNullable();
        table.date("endDate").nullable();
        table.decimal("avgShipping", 8, 2).notNullable();
        table.decimal("dailyAdSpend", 10, 2).notNullable();
        table.timestamps(true, true);
      });
      console.log("✅ Created storeCostHistory table");
    }

    // Run billing setup
    await runBillingSetup();
  } catch (err) {
    console.error("DB setup error:", err);
  }
}
