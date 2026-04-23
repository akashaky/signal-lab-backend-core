import express from "express";
import crypto from "crypto";
import { sendToQueue } from "../../lib/sqs.js";
import KnexClient from "../../knex.js";

const router = express.Router();

function verifyShopifyHmac(rawBody, hmacHeader) {
  const digest = crypto
    .createHmac("sha256", process.env.client_secret)
    .update(rawBody, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

router.post("/shopify", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    const topic = req.headers["x-shopify-topic"];
    const shop = req.headers["x-shopify-shop-domain"];

    if (!hmac || !verifyShopifyHmac(req.body, hmac)) {
      return res.status(401).send("Unauthorized");
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch (err) {
      console.error("Failed to parse webhook body:", err);
      return res.status(400).send("Invalid JSON");
    }

    if (topic === "app/uninstalled") {
      await KnexClient("shopifyStore")
        .where("myshopifyDomain", shop)
        .update({ isUninstalled: 1 });
      console.log(`App uninstalled for shop: ${shop}`);
      return res.status(200).send("OK");
    }

    // // Discard products/update and orders/updated events
    // if (topic === "products/update" || topic === "orders/updated") {
    //   console.log(`Discarding ${topic} event for shop: ${shop}`);
    //   return res.status(200).send("OK");
    // }

    try {
      await sendToQueue({ topic, shop, payload });
    } catch (err) {
      console.error("Failed to send to SQS:", err);
      return res.status(500).send("Queue error");
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Unexpected error in webhook handler:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
