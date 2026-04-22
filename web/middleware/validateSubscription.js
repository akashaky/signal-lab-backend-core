import KnexClient from "../knex.js";

/**
 * Middleware to check if the store has an active subscription or valid trial
 */
async function validateSubscription(req, res, next) {
  try {
    const { shop } = req.user;

    // Get store
    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", shop)
      .first();

    if (!store) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Get active subscription
    const subscription = await KnexClient("subscriptions")
      .where("storeId", store.id)
      .whereIn("status", ["trial", "active"])
      .first();

    if (!subscription) {
      return res.status(403).json({ 
        error: "No active subscription",
        code: "SUBSCRIPTION_REQUIRED",
        message: "Please subscribe to access this feature"
      });
    }

    // Check if trial has expired
    if (subscription.status === "trial" && subscription.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(subscription.trialEndsAt);
      
      if (now > trialEnd) {
        // Update subscription status to expired
        await KnexClient("subscriptions")
          .where("id", subscription.id)
          .update({ status: "expired" });

        // Log event
        await KnexClient("billing_events").insert({
          storeId: store.id,
          subscriptionId: subscription.id,
          type: "trial_ended",
          metadata: JSON.stringify({ trialEndsAt: subscription.trialEndsAt })
        });

        return res.status(403).json({ 
          error: "Trial expired",
          code: "TRIAL_EXPIRED",
          message: "Your trial has expired. Please subscribe to continue."
        });
      }
    }

    // Check if active subscription is past due
    if (subscription.status === "active" && subscription.currentPeriodEnd) {
      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);
      
      if (now > periodEnd) {
        // Grace period of 3 days
        const gracePeriodEnd = new Date(periodEnd);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
        
        if (now > gracePeriodEnd) {
          await KnexClient("subscriptions")
            .where("id", subscription.id)
            .update({ status: "past_due" });

          return res.status(403).json({ 
            error: "Subscription past due",
            code: "SUBSCRIPTION_PAST_DUE",
            message: "Your subscription payment is past due. Please update your payment method."
          });
        }
      }
    }

    // Attach subscription to request
    req.subscription = subscription;
    next();
  } catch (err) {
    console.error("Error in validateSubscription middleware:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export default validateSubscription;
