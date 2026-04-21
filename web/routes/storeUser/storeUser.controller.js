import KnexClient from "../../knex.js";
import express from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

const router = express.Router();

/**
 * Step 1: App entry – Start OAuth install flow
 */
router.get("/", async (req, res) => {
  try {
    const { shop, hmac } = req.query;

    if (!shop) {
      return res.status(400).send("Missing 'shop' parameter");
    }

    const installParams = new URLSearchParams({
      client_id: process.env.client_id,
      scope: process.env.scope,
      redirect_uri: process.env.store_install_redirection_url,
      state: uuidv4(),
      hmac,
    });
    const redirectUrl = `https://${shop}/admin/oauth/authorize?${installParams.toString()}&grant_options[]=offline_access`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error in GET /:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Step 2: OAuth redirect – Exchange code for access token
 */
router.get("/auth", async (req, res) => {
  try {
    const { shop, code, hmac } = req.query;

    if (!shop || !code) {
      return res.status(400).send("Missing 'shop' or 'code' in query");
    }

    const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;

    const response = await axios.post(accessTokenRequestUrl, {
      client_id: process.env.client_id,
      client_secret: process.env.client_secret,
      code,
    });

    const accessToken = response.data.access_token;

    const shopData = await getStoreData(shop, accessToken);
    const mappedShop = mapShopToDb(shopData);

    const isStoreExists = await getStoreByDomain(mappedShop.myshopifyDomain);
    let storeId;
    if (isStoreExists) {
      await KnexClient("shopifyStore")
        .where("myshopifyDomain", mappedShop.myshopifyDomain)
        .update(mappedShop);
      storeId = isStoreExists.id;
    } else {
      const [id] = await KnexClient("shopifyStore").insert(mappedShop);
      storeId = id;
    }

    const accessTokenData = await getAccessTokenByStoreId(storeId);
    if (!accessTokenData) {
      const newToken = await insertAccessToken({
        storeId,
        scope: req.query.scope || process.env.scopes,
        requestedScope: process.env.scopes,
        offlineToken: accessToken,
      });
    } else {
      await KnexClient("accessToken")
        .where("storeId", storeId)
        .update({
          scope: req.query.scope || process.env.scopes,
          requestedScope: process.env.scopes,
          offlineToken: accessToken,
        });
    }

    await registerWebhooks(shop, accessToken);
    triggerBulkOperation(shop, accessToken);
    handleUserCreation(req.query, res);
  } catch (error) {
    console.error("Error in /auth:", error?.response?.data || error.message);
    res.status(500).send("OAuth Error");
  }
});

/**
 * Step 3: User-level authorization
 */
async function handleUserCreation(query, res) {
  try {
    const userAuthParams = new URLSearchParams({
      client_id: process.env.client_id,
      scope: process.env.scope,
      redirect_uri: process.env.store_user_redirection_url,
    });

    res.redirect(
      `https://${
        query.shop
      }/admin/oauth/authorize?${userAuthParams.toString()}&grant_options[]=per-user`
    );
  } catch (error) {
    console.error("Error in handleUserCreation:", error);
    res.status(500).send("User Auth Redirect Error");
  }
}

/**
 * Shopify API: Get store info
 */
async function getStoreData(shop, accessToken) {
  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2025-01/shop.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.shop;
  } catch (error) {
    console.error(
      "Error fetching shop data:",
      error?.response?.data || error.message
    );
    return null;
  }
}

/**
 * Optional route to test user-level redirection
 */
router.get("/auth/user", async (req, res) => {
  try {
    const { shop, code } = req.query;

    if (!shop || !code) {
      return res.status(400).send("Missing shop or code");
    }

    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.client_id,
        client_secret: process.env.client_secret,
        code,
      }
    );

    const { associated_user } = tokenResponse.data;
    const storeData = await getStoreByDomain(shop);

    const getUser = await getUserByShopifyId(associated_user.id);
    if (!getUser) {
      const inserted = await KnexClient("shopifyUser").insert(
        mapShopifyUser(associated_user, storeData.id)
      );
    } else {
      await KnexClient("shopifyUser")
        .where("id", getUser.id)
        .update(mapShopifyUser(associated_user, storeData.id));
    }

    const payload = {
      userShopifyId: associated_user.id,
      email: associated_user.email,
      shop: shop,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.redirect(`https://admin-ui-co.netlify.app/?token=${token}`);
  } catch (error) {
    console.error(
      "Error in /auth/user:",
      error?.response?.data || error.message
    );
    res.status(500).send("Error completing user OAuth");
  }
});

function mapShopToDb(shop) {
  return {
    storeShopifyId: shop.id,
    name: shop.name,
    email: shop.email,
    domain: shop.domain,
    province: shop.province,
    country: shop.country,
    address1: shop.address1,
    zip: shop.zip,
    city: shop.city,
    source: shop.source,
    phone: shop.phone,
    latitude: shop.latitude,
    longitude: shop.longitude,
    primaryLocale: shop.primary_locale,
    address2: shop.address2,
    createdAt: shop.created_at,
    updatedAt: shop.updated_at,
    countryCode: shop.country_code,
    countryName: shop.country_name,
    currency: shop.currency,
    customerEmail: shop.customer_email,
    timezone: shop.timezone,
    ianaTimezone: shop.iana_timezone,
    shopOwner: shop.shop_owner,
    moneyFormat: shop.money_format,
    moneyWithCurrencyFormat: shop.money_with_currency_format,
    weightUnit: shop.weight_unit,
    provinceCode: shop.province_code,
    taxesIncluded: shop.taxes_included,
    autoConfigureTaxInclusivity: shop.auto_configure_tax_inclusivity,
    taxShipping: shop.tax_shipping,
    countyTaxes: shop.county_taxes,
    planDisplayName: shop.plan_display_name,
    planName: shop.plan_name,
    hasDiscounts: shop.has_discounts,
    hasGiftCards: shop.has_gift_cards,
    myshopifyDomain: shop.myshopify_domain,
    googleAppsDomain: shop.google_apps_domain,
    googleAppsLoginEnabled: shop.google_apps_login_enabled,
    moneyInEmailsFormat: shop.money_in_emails_format,
    moneyWithCurrencyInEmailsFormat: shop.money_with_currency_in_emails_format,
    eligibleForPayments: shop.eligible_for_payments,
    requiresExtraPaymentsAgreement: shop.requires_extra_payments_agreement,
    passwordEnabled: shop.password_enabled,
    hasStorefront: shop.has_storefront,
    finances: shop.finances,
    primaryLocationId: shop.primary_location_id,
    checkoutApiSupported: shop.checkout_api_supported,
    multiLocationEnabled: shop.multi_location_enabled,
    setupRequired: shop.setup_required,
    preLaunchEnabled: shop.pre_launch_enabled,
    enabledPresentmentCurrencies: JSON.stringify(
      shop.enabled_presentment_currencies
    ), // store as JSON string
    marketingSmsConsentEnabledAtCheckout:
      shop.marketing_sms_consent_enabled_at_checkout,
    transactionalSmsDisabled: shop.transactional_sms_disabled,
  };
}

async function getStoreByDomain(myshopifyDomain) {
  try {
    const store = await KnexClient("shopifyStore")
      .where("myshopifyDomain", myshopifyDomain)
      .first(); // returns first matching row or undefined if none found

    return store;
  } catch (err) {
    console.error("DB query error:", err);
  }
}

function mapShopifyUser(user, storeId) {
  return {
    shopifyUserId: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    accountOwner: user.account_owner,
    locale: user.locale,
    collaborator: user.collaborator,
    emailVerified: user.email_verified,
    storeId,
  };
}

async function getUserByShopifyId(shopifyUserId) {
  try {
    const user = await KnexClient("shopifyUser")
      .where("shopifyUserId", shopifyUserId)
      .first(); // Get a single record
    return user;
  } catch (err) {
    console.error("Error fetching user:", err);
    throw err;
  }
}

async function getAccessTokenByStoreId(storeId) {
  try {
    const token = await KnexClient("accessToken")
      .where("storeId", storeId)
      .first();
    return token;
  } catch (err) {
    console.error("Error fetching access token:", err);
    throw err;
  }
}

async function insertAccessToken({
  storeId,
  scope,
  requestedScope,
  offlineToken,
}) {
  const newToken = {
    storeId,
    scope,
    requestedScope,
    offlineToken,
  };

  try {
    const inserted = await KnexClient("accessToken").insert(newToken);
    return inserted[0]; // returns inserted row ID
  } catch (err) {
    console.error("Insert failed:", err);
    throw err;
  }
}

const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "products/create",
  "products/update",
  "products/delete",
  "customers/create",
  "customers/update",
  "customers/delete",
  "refunds/create",
  "bulk_operations/finish",
  "app/uninstalled",
  "shop/redact",
];

async function registerWebhooks(shop, accessToken) {
  try {
    const endpoint = process.env.WEBHOOK_ENDPOINT;

    let existing = [];
    try {
      const existingRes = await axios.get(
        `https://${shop}/admin/api/2025-01/webhooks.json`,
        { headers: { "X-Shopify-Access-Token": accessToken } }
      );
      existing = existingRes.data.webhooks.map((w) => w.topic);
    } catch (err) {
      console.error("Failed to fetch existing webhooks:", err?.response?.data || err.message);
    }

    for (const topic of WEBHOOK_TOPICS) {
      if (existing.includes(topic)) continue;
      try {
        await axios.post(
          `https://${shop}/admin/api/2025-01/webhooks.json`,
          { webhook: { topic, address: endpoint, format: "json" } },
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        console.log(`Webhook registered: ${topic}`);
      } catch (err) {
        console.error(`Failed to register webhook ${topic}:`, err?.response?.data || err.message);
      }
    }
  } catch (err) {
    console.error("Unexpected error in registerWebhooks:", err);
  }
}

async function triggerBulkOperation(shop, accessToken) {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const since = twelveMonthsAgo.toISOString();

  const mutation = `
    mutation {
      bulkOperationRunQuery(
        query: """
        {
          orders(query: "created_at:>${since}") {
            edges {
              node {
                id
                name
                email
                totalPriceSet { shopMoney { amount currencyCode } }
                createdAt
                updatedAt
                displayFinancialStatus
                displayFulfillmentStatus
                customer { id }
                lineItems {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalUnitPriceSet { shopMoney { amount currencyCode } }
                    }
                  }
                }
                refunds {
                  id
                  createdAt
                  totalRefundedSet { shopMoney { amount currencyCode } }
                }
              }
            }
          }
          customers {
            edges {
              node {
                id
                email
                firstName
                lastName
                createdAt
                updatedAt
                ordersCount
                totalSpentV2 { amount currencyCode }
                phone
                tags
              }
            }
          }
          products {
            edges {
              node {
                id
                title
                handle
                status
                createdAt
                updatedAt
                tags
                variants {
                  edges {
                    node {
                      id
                      title
                      price
                      sku
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
        """
      ) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    let response;
    try {
      response = await axios.post(
        `https://${shop}/admin/api/2025-01/graphql.json`,
        { query: mutation },
        { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error("Failed to call Shopify GraphQL for bulk operation:", err?.response?.data || err.message);
      return;
    }

    const result = response.data?.data?.bulkOperationRunQuery;
    if (result?.userErrors?.length) {
      console.error("Bulk operation userErrors:", result.userErrors);
    } else {
      console.log(`Bulk operation started: ${result?.bulkOperation?.id}`);
    }
  } catch (err) {
    console.error("Unexpected error in triggerBulkOperation:", err);
  }
}

export default router;
