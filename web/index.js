import express from "express";
import shopify from "./shopify.js";
import storeUser from "./routes/storeUser/storeUser.controller.js";
import UserController from "./routes/user/user.controller.js";
import WebhookController from "./routes/webhook/webhook.controller.js";
import OnboardingController from "./routes/onboarding/onboarding.controller.js";
import BillingController from "./routes/billing/billing.controller.js";
import ProductsController from "./routes/products/products.controller.js";
import AnalyticsController from "./routes/analytics/analytics.controller.js";
import cors from "cors";
import dotenv from "dotenv";
import { runDbSetup } from "./db/setup.js";

import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const PORT = 3000;
const app = express();

// CORS must be configured BEFORE other23ed-2409-40d0-103e-7856-fdf0-4dc7-2ca0-b321 middleware
app.use(cors());

app.use("/api/webhook", WebhookController);

app.use(express.json());

shopify.cspHeaders();

app.get("/test", (req, res) => {
  return res.send("Running....");
});

app.use("/api/store", storeUser);
app.use("/api/user", UserController);
app.use("/api/onboarding", OnboardingController);
app.use("/api/billing", BillingController);
app.use("/api/products", ProductsController);
app.use("/api/analytics", AnalyticsController);

runDbSetup();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ App is running on http://0.0.0.0:${PORT}`);
});
