import express from "express";
import axios from "axios";
import validateJWT from "../../middleware/validateUserToken.js";
import KnexClient from "../../knex.js";

const router = express.Router();

// Shopify Billing API helper
async function createShopifyRecurringCharge(shop, accessToken, planDetails) {
  try {
    const response = await axios.post(
      `https://${shop}/admin/api/2025-01/recurring_application_charges.json`,
      {
        recurring_application_charge: {
          name: planDetails.name,
          price: planDetails.price,
          trial_days: planDetails.trialDays,
          test: process.env.NODE_ENV !== "production", // Test mode in development
          return_url: `${process.env.HOST}/api/billing/confirm`,
        },
      },
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.recurring_application_charge;
  } catch (err) {
    console.error("Failed to create Shopify charge:", err?.response?.data || err.message);
    throw err;
  }
}

async function activateShopifyCharge(shop, accessToken, chargeId) {
  try {
    const response = await axios.post(
      `https://${shop}/admin/api/2025-01/recurring_application_charges/${chargeId}/activate.json`,
      {},
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.recurring_application_charge;
  } catch (err) {
    console.error("Failed to activate Shopify charge:", err?.response?.data || err.message);
    throw err;
  }
}

async function getShopifyCharge(shop, accessToken, chargeId) {
  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2025-01/recurring_application_charges/${chargeId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.recurring_application_charge;
  } catch (err) {
    console.error("Failed to get Shopify charge:", err?.response?.data || err.message);
    throw err;
  }
}

async function cancelShopifyCharge(shop, accessToken, chargeId) {
  try {
    await axios.delete(
      `https://${shop}/admin/api/2025-01/recurring_application_charges/${chargeId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    return true;
  } catch (err) {
    console.error("Failed to cancel Shopify charge:", err?.response?.data || err.message);
    throw err;
  }
}

// GET /api/billing/status - Get current subscription status
router.get("/status", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Get access token
    const accessTokenRecord = await KnexClient("accessToken")
      .where("storeId", store.id)
      .first();

    if (!accessTokenRecord) {
      return res.status(404).json({ error: "Access token not found" });
    }

    // Get active or most recent subscription
    const subscription = await KnexClient("subscriptions")
      .where("storeId", store.id)
      .orderBy("created_at", "desc")
      .first();

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        status: null,
        plan: null,
        trial: null
      });
    }

    // Get plan details
    const plan = await KnexClient("subscription_plans")
      .where("id", subscription.planId)
      .first();

    // If we have a Shopify charge ID, sync status from Shopify
    if (subscription.shopifyChargeId && accessTokenRecord.offlineToken) {
      try {
        const shopifyCharge = await getShopifyCharge(
          shop,
          accessTokenRecord.offlineToken,
          subscription.shopifyChargeId
        );

        // Update local status based on Shopify status
        // Shopify marks a charge "active" once merchant approves — but if the trial
        // period hasn't ended yet, our local status stays "trial".
        const statusMap = {
          pending: "trial",
          declined: "cancelled",
          expired: "expired",
          frozen: "past_due",
          cancelled: "cancelled"
        };

        const now = new Date();
        const shopifyTrialEnd = shopifyCharge.trial_ends_on ? new Date(shopifyCharge.trial_ends_on) : null;
        const localTrialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
        const trialEnd = shopifyTrialEnd || localTrialEnd;
        const stillInTrial = trialEnd && now < trialEnd;

        let newStatus;
        if (shopifyCharge.status === "active") {
          newStatus = stillInTrial ? "trial" : "active";
        } else {
          newStatus = statusMap[shopifyCharge.status] || subscription.status;
        }
        if (newStatus !== subscription.status) {
          await KnexClient("subscriptions")
            .where("id", subscription.id)
            .update({ status: newStatus });
          subscription.status = newStatus;
        }

        // Update trial end date from Shopify
        if (shopifyCharge.trial_ends_on && !subscription.trialEndsAt) {
          const trialEnd = new Date(shopifyCharge.trial_ends_on);
          await KnexClient("subscriptions")
            .where("id", subscription.id)
            .update({ trialEndsAt: trialEnd });
          subscription.trialEndsAt = trialEnd;
        }
      } catch (err) {
        console.error("Failed to sync with Shopify:", err);
        // Continue with local data
      }
    }

    // Calculate trial info
    let trialInfo = null;
    if (subscription.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(subscription.trialEndsAt);
      const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      
      trialInfo = {
        isActive: now < trialEnd && subscription.status === "trial",
        startedAt: subscription.trialStartedAt,
        endsAt: subscription.trialEndsAt,
        daysRemaining: Math.max(0, daysRemaining)
      };
    }

    return res.json({
      hasSubscription: true,
      status: subscription.status,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.priceInCents / 100,
        priceInCents: plan.priceInCents,
        features: plan.features ? JSON.parse(plan.features) : []
      },
      trial: trialInfo,
      currentPeriod: {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd
      },
      cancelledAt: subscription.cancelledAt,
      shopifyChargeId: subscription.shopifyChargeId,
      confirmationUrl: subscription.confirmationUrl
    });
  } catch (err) {
    console.error("Error in GET /billing/status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/billing/start-trial - Start a trial subscription with Shopify
router.post("/start-trial", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Get access token
    const accessTokenRecord = await KnexClient("accessToken")
      .where("storeId", store.id)
      .first();

    if (!accessTokenRecord) {
      return res.status(404).json({ error: "Access token not found" });
    }

    // Check if already has a subscription
    const existingSubscription = await KnexClient("subscriptions")
      .where("storeId", store.id)
      .whereIn("status", ["trial", "active"])
      .first();

    if (existingSubscription) {
      return res.status(400).json({ 
        error: "Subscription already exists",
        subscription: existingSubscription
      });
    }

    // Get default plan
    const plan = await KnexClient("subscription_plans")
      .where("isActive", 1)
      .first();

    if (!plan) {
      return res.status(500).json({ error: "No active plan available" });
    }

    // Create Shopify recurring charge
    const shopifyCharge = await createShopifyRecurringCharge(
      shop,
      accessTokenRecord.offlineToken,
      {
        name: plan.name,
        price: plan.priceInCents / 100,
        trialDays: plan.trialDays
      }
    );

    // Calculate trial dates
    const now = new Date();
    const trialEnd = shopifyCharge.trial_ends_on 
      ? new Date(shopifyCharge.trial_ends_on)
      : new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);

    // Create subscription in our database
    const [subscriptionId] = await KnexClient("subscriptions").insert({
      storeId: store.id,
      planId: plan.id,
      status: "trial",
      trialStartedAt: now,
      trialEndsAt: trialEnd,
      shopifyChargeId: shopifyCharge.id,
      confirmationUrl: shopifyCharge.confirmation_url
    });

    // Log event
    await KnexClient("billing_events").insert({
      storeId: store.id,
      subscriptionId: subscriptionId,
      type: "trial_started",
      metadata: JSON.stringify({
        planId: plan.id,
        trialDays: plan.trialDays,
        trialEndsAt: trialEnd,
        shopifyChargeId: shopifyCharge.id
      })
    });

    return res.json({
      success: true,
      subscription: {
        id: subscriptionId,
        status: "trial",
        trialEndsAt: trialEnd,
        confirmationUrl: shopifyCharge.confirmation_url,
        plan: {
          name: plan.name,
          price: plan.priceInCents / 100
        }
      }
    });
  } catch (err) {
    console.error("Error in POST /billing/start-trial:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/billing/confirm - Shopify redirects here after user confirms charge
router.get("/confirm", async (req, res) => {
  try {
    const { charge_id, shop } = req.query;

    if (!charge_id || !shop) {
      return res.status(400).send("Missing charge_id or shop parameter");
    }

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).send("Store not found");
    }

    // Get access token
    const accessTokenRecord = await KnexClient("accessToken")
      .where("storeId", store.id)
      .first();

    if (!accessTokenRecord) {
      return res.status(404).send("Access token not found");
    }

    // Get the charge from Shopify
    const shopifyCharge = await getShopifyCharge(
      shop,
      accessTokenRecord.offlineToken,
      charge_id
    );

    // Activate the charge if it's accepted
    if (shopifyCharge.status === "accepted") {
      await activateShopifyCharge(
        shop,
        accessTokenRecord.offlineToken,
        charge_id
      );

      // Update subscription in database
      const subscription = await KnexClient("subscriptions")
        .where("storeId", store.id)
        .where("shopifyChargeId", charge_id)
        .first();

      if (subscription) {
        const now = new Date();
        const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
        const stillInTrial = trialEnd && now < trialEnd;
        const plan = await KnexClient("subscription_plans")
          .where("id", subscription.planId)
          .first();

        if (stillInTrial) {
          // Merchant approved the charge but trial is still running — stay in trial
          await KnexClient("subscriptions")
            .where("id", subscription.id)
            .update({ status: "trial" });

          await KnexClient("billing_events").insert({
            storeId: store.id,
            subscriptionId: subscription.id,
            type: "trial_started",
            metadata: JSON.stringify({
              planId: plan.id,
              shopifyChargeId: charge_id,
              trialEndsAt: trialEnd
            })
          });
        } else {
          // No trial or trial already ended — activate billing immediately
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await KnexClient("subscriptions")
            .where("id", subscription.id)
            .update({
              status: "active",
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd
            });

          await KnexClient("billing_events").insert({
            storeId: store.id,
            subscriptionId: subscription.id,
            type: "subscription_created",
            amountInCents: plan.priceInCents,
            metadata: JSON.stringify({
              planId: plan.id,
              shopifyChargeId: charge_id,
              periodStart: now,
              periodEnd: periodEnd
            })
          });
        }
      }
    }

    // Redirect to billing page in the app
    const shopName = shop.split(".myshopify.com")[0];
    res.redirect(`https://${shopName}.app.revsignallab.com/billing?activated=true`);
  } catch (err) {
    console.error("Error in GET /billing/confirm:", err);
    res.status(500).send("Error confirming charge");
  }
});

// POST /api/billing/cancel - Cancel subscription with Shopify
router.post("/cancel", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Get access token
    const accessTokenRecord = await KnexClient("accessToken")
      .where("storeId", store.id)
      .first();

    if (!accessTokenRecord) {
      return res.status(404).json({ error: "Access token not found" });
    }

    const subscription = await KnexClient("subscriptions")
      .where("storeId", store.id)
      .whereIn("status", ["trial", "active"])
      .first();

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const now = new Date();

    // Cancel the charge in Shopify
    if (subscription.shopifyChargeId) {
      try {
        await cancelShopifyCharge(
          shop,
          accessTokenRecord.offlineToken,
          subscription.shopifyChargeId
        );
      } catch (err) {
        console.error("Failed to cancel Shopify charge:", err);
        // Continue with local cancellation even if Shopify fails
      }
    }

    // Update local subscription
    await KnexClient("subscriptions")
      .where("id", subscription.id)
      .update({
        status: "cancelled",
        cancelledAt: now
      });

    // Log event
    await KnexClient("billing_events").insert({
      storeId: store.id,
      subscriptionId: subscription.id,
      type: "subscription_cancelled",
      metadata: JSON.stringify({
        cancelledAt: now,
        shopifyChargeId: subscription.shopifyChargeId
      })
    });

    return res.json({
      success: true,
      message: "Subscription cancelled successfully"
    });
  } catch (err) {
    console.error("Error in POST /billing/cancel:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/billing/plans - Get available plans
router.get("/plans", validateJWT, async (req, res) => {
  try {
    const plans = await KnexClient("subscription_plans")
      .where("isActive", 1)
      .select("*");

    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      price: plan.priceInCents / 100,
      priceInCents: plan.priceInCents,
      trialDays: plan.trialDays,
      features: plan.features ? JSON.parse(plan.features) : []
    }));

    return res.json({ plans: formattedPlans });
  } catch (err) {
    console.error("Error in GET /billing/plans:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/billing/history - Get billing history
router.get("/history", validateJWT, async (req, res) => {
  try {
    const { shop } = req.user;

    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    const events = await KnexClient("billing_events")
      .where("storeId", store.id)
      .orderBy("eventAt", "desc")
      .limit(50);

    const formattedEvents = events.map(event => ({
      id: event.id,
      type: event.type,
      amount: event.amountInCents ? event.amountInCents / 100 : null,
      eventAt: event.eventAt,
      metadata: event.metadata ? JSON.parse(event.metadata) : null
    }));

    return res.json({ events: formattedEvents });
  } catch (err) {
    console.error("Error in GET /billing/history:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
