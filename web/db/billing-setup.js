import KnexClient from "../knex.js";

export async function runBillingSetup() {
  try {
    // Create subscription_plans table
    const hasSubscriptionPlans = await KnexClient.schema.hasTable("subscription_plans");
    if (!hasSubscriptionPlans) {
      await KnexClient.schema.createTable("subscription_plans", (table) => {
        table.increments("id").primary();
        table.string("name", 50).notNullable();
        table.integer("priceInCents").notNullable(); // 1900 for $19.00
        table.integer("trialDays").notNullable().defaultTo(21);
        table.text("features").nullable(); // JSON string
        table.tinyint("isActive").notNullable().defaultTo(1);
        table.timestamps(true, true);
      });
      console.log("✅ Created subscription_plans table");

      // Insert default plan
      await KnexClient("subscription_plans").insert({
        name: "Pro Plan",
        priceInCents: 1900,
        trialDays: 21,
        features: JSON.stringify([
          "Full analytics access",
          "Unlimited products",
          "Priority support",
          "Advanced reporting"
        ]),
        isActive: 1
      });
      console.log("✅ Inserted default Pro Plan");
    }

    // Create subscriptions table
    const hasSubscriptions = await KnexClient.schema.hasTable("subscriptions");
    if (!hasSubscriptions) {
      await KnexClient.schema.createTable("subscriptions", (table) => {
        table.increments("id").primary();
        table.integer("storeId").unsigned().notNullable();
        table.foreign("storeId").references("id").inTable("shopifyStore");
        table.integer("planId").unsigned().notNullable();
        table.foreign("planId").references("id").inTable("subscription_plans");
        table.enum("status", ["trial", "active", "cancelled", "expired", "past_due"]).notNullable().defaultTo("trial");
        table.timestamp("trialStartedAt").nullable();
        table.timestamp("trialEndsAt").nullable();
        table.timestamp("currentPeriodStart").nullable();
        table.timestamp("currentPeriodEnd").nullable();
        table.timestamp("cancelledAt").nullable();
        table.bigInteger("shopifyChargeId").nullable(); // Shopify recurring charge ID
        table.text("confirmationUrl").nullable(); // Shopify confirmation URL
        table.timestamps(true, true);
        table.index("storeId");
        table.index("status");
        table.index("shopifyChargeId");
      });
      console.log("✅ Created subscriptions table");
    }

    // Create billing_events table
    const hasBillingEvents = await KnexClient.schema.hasTable("billing_events");
    if (!hasBillingEvents) {
      await KnexClient.schema.createTable("billing_events", (table) => {
        table.increments("id").primary();
        table.integer("storeId").unsigned().notNullable();
        table.foreign("storeId").references("id").inTable("shopifyStore");
        table.integer("subscriptionId").unsigned().nullable();
        table.foreign("subscriptionId").references("id").inTable("subscriptions");
        table.enum("type", [
          "trial_started",
          "trial_ending_soon",
          "trial_ended",
          "subscription_created",
          "charge_attempted",
          "charge_succeeded",
          "charge_failed",
          "subscription_cancelled",
          "subscription_renewed"
        ]).notNullable();
        table.integer("amountInCents").nullable();
        table.text("metadata").nullable(); // JSON string for additional data
        table.timestamp("eventAt").notNullable().defaultTo(KnexClient.fn.now());
        table.timestamps(true, true);
        table.index("storeId");
        table.index("type");
        table.index("eventAt");
      });
      console.log("✅ Created billing_events table");
    }

  } catch (err) {
    console.error("Billing setup error:", err);
  }
}
