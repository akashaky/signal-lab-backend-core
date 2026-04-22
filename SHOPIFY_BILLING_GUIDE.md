# Shopify Billing Integration Guide

## Overview

This guide explains how the billing system integrates with Shopify's Recurring Application Charges API to handle subscriptions for your Shopify app.

## Shopify Billing Flow

### 1. Create Recurring Charge

When a merchant clicks "Start Trial", the app creates a recurring charge in Shopify:

```javascript
POST https://{shop}/admin/api/2025-01/recurring_application_charges.json
{
  "recurring_application_charge": {
    "name": "Pro Plan",
    "price": 19.00,
    "trial_days": 21,
    "test": false,
    "return_url": "https://dev-api.revsignallab.com/api/billing/confirm"
  }
}
```

**Response:**
```json
{
  "recurring_application_charge": {
    "id": 1234567890,
    "name": "Pro Plan",
    "price": "19.00",
    "status": "pending",
    "trial_days": 21,
    "trial_ends_on": "2024-02-15",
    "confirmation_url": "https://example.myshopify.com/admin/charges/1234567890/confirm"
  }
}
```

### 2. Merchant Approval

The app redirects the merchant to the `confirmation_url` where they can:
- Review the charge details
- Accept or decline the charge

### 3. Charge Activation

After merchant accepts, Shopify redirects to your `return_url` with the charge ID:

```
https://dev-api.revsignallab.com/api/billing/confirm?charge_id=1234567890&shop=example.myshopify.com
```

Your app then activates the charge:

```javascript
POST https://{shop}/admin/api/2025-01/recurring_application_charges/{charge_id}/activate.json
```

### 4. Automatic Billing

After activation:
- Trial period runs for 21 days
- After trial, Shopify automatically charges the merchant monthly
- Charges appear in the merchant's Shopify billing

## Implementation Details

### Backend Endpoints

#### POST `/api/billing/start-trial`
Creates a Shopify recurring charge and stores it in the database.

**Flow:**
1. Check if merchant already has a subscription
2. Get the Pro Plan details from database
3. Create recurring charge in Shopify
4. Store subscription with `shopifyChargeId` and `confirmationUrl`
5. Return confirmation URL to frontend
6. Frontend redirects merchant to Shopify for approval

#### GET `/api/billing/confirm`
Handles the redirect from Shopify after merchant approves the charge.

**Flow:**
1. Receive `charge_id` and `shop` from query params
2. Fetch charge details from Shopify
3. If status is "accepted", activate the charge
4. Update subscription status to "active"
5. Log billing event
6. Redirect merchant back to app

#### POST `/api/billing/cancel`
Cancels the recurring charge in Shopify.

**Flow:**
1. Get subscription with `shopifyChargeId`
2. Call Shopify API to delete the charge
3. Update local subscription status to "cancelled"
4. Log billing event

#### GET `/api/billing/status`
Gets current subscription status and syncs with Shopify.

**Flow:**
1. Get local subscription from database
2. If `shopifyChargeId` exists, fetch current status from Shopify
3. Update local status if changed
4. Return subscription details

### Database Schema

The `subscriptions` table includes Shopify-specific fields:

```sql
CREATE TABLE subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  storeId INT NOT NULL,
  planId INT NOT NULL,
  status ENUM('trial', 'active', 'cancelled', 'expired', 'past_due'),
  trialStartedAt TIMESTAMP,
  trialEndsAt TIMESTAMP,
  currentPeriodStart TIMESTAMP,
  currentPeriodEnd TIMESTAMP,
  cancelledAt TIMESTAMP,
  shopifyChargeId BIGINT,           -- Shopify recurring charge ID
  confirmationUrl TEXT,              -- URL for merchant to confirm charge
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Frontend Integration

#### Starting a Trial

```javascript
const handleStartTrial = async () => {
  const response = await apiCall("/api/billing/start-trial", { method: "POST" });
  
  // Redirect to Shopify for approval
  if (response.subscription?.confirmationUrl) {
    window.top.location.href = response.subscription.confirmationUrl;
  }
};
```

**Important:** Use `window.top.location.href` to break out of the iframe if your app is embedded in Shopify admin.

#### Handling Return from Shopify

After merchant approves, Shopify redirects to `/api/billing/confirm`, which then redirects to:

```
https://{shop-name}.app.revsignallab.com/billing?activated=true
```

Your frontend can check for the `activated` query parameter to show a success message.

## Shopify API Reference

### Recurring Application Charge Object

```json
{
  "id": 1234567890,
  "name": "Pro Plan",
  "price": "19.00",
  "status": "pending|accepted|active|declined|expired|frozen|cancelled",
  "trial_days": 21,
  "trial_ends_on": "2024-02-15",
  "billing_on": "2024-02-15",
  "activated_on": "2024-01-25",
  "cancelled_on": null,
  "confirmation_url": "https://example.myshopify.com/admin/charges/1234567890/confirm",
  "return_url": "https://dev-api.revsignallab.com/api/billing/confirm",
  "test": false,
  "created_at": "2024-01-25T10:00:00Z",
  "updated_at": "2024-01-25T10:00:00Z"
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Charge created, awaiting merchant approval |
| `accepted` | Merchant approved, ready to activate |
| `active` | Charge activated and billing |
| `declined` | Merchant declined the charge |
| `expired` | Charge expired before activation |
| `frozen` | Charge frozen due to payment issues |
| `cancelled` | Charge cancelled by app or merchant |

### API Endpoints

#### Create Charge
```
POST /admin/api/2025-01/recurring_application_charges.json
```

#### Get Charge
```
GET /admin/api/2025-01/recurring_application_charges/{charge_id}.json
```

#### Activate Charge
```
POST /admin/api/2025-01/recurring_application_charges/{charge_id}/activate.json
```

#### Cancel Charge
```
DELETE /admin/api/2025-01/recurring_application_charges/{charge_id}.json
```

#### List All Charges
```
GET /admin/api/2025-01/recurring_application_charges.json
```

## Testing

### Test Mode

Set `test: true` when creating charges in development:

```javascript
{
  recurring_application_charge: {
    name: "Pro Plan",
    price: 19.00,
    trial_days: 21,
    test: true  // No actual charges in test mode
  }
}
```

Test charges:
- Don't actually bill the merchant
- Show "Test" badge in Shopify admin
- Can be created/cancelled freely

### Testing Flow

1. **Create Test Charge**
   ```bash
   curl -X POST https://dev-api.revsignallab.com/api/billing/start-trial \
     -H "Authorization: Bearer <token>"
   ```

2. **Approve in Shopify**
   - Click the confirmation URL
   - Approve the charge in Shopify admin

3. **Verify Activation**
   ```bash
   curl https://dev-api.revsignallab.com/api/billing/status \
     -H "Authorization: Bearer <token>"
   ```

4. **Cancel Charge**
   ```bash
   curl -X POST https://dev-api.revsignallab.com/api/billing/cancel \
     -H "Authorization: Bearer <token>"
   ```

## Production Checklist

- [ ] Set `test: false` in production
- [ ] Verify `return_url` points to production API
- [ ] Test complete flow in development store
- [ ] Verify charges appear in Shopify admin
- [ ] Test cancellation flow
- [ ] Monitor billing events in database
- [ ] Set up alerts for failed charges
- [ ] Document merchant-facing billing process

## Common Issues

### Issue: Charge not activating

**Cause:** Trying to activate before merchant accepts

**Solution:** Only activate when status is "accepted"

```javascript
if (shopifyCharge.status === "accepted") {
  await activateShopifyCharge(shop, accessToken, chargeId);
}
```

### Issue: Redirect loop

**Cause:** Embedded app trying to redirect

**Solution:** Use `window.top.location.href` to break out of iframe

```javascript
window.top.location.href = confirmationUrl;
```

### Issue: Charge already exists

**Cause:** Trying to create multiple charges for same merchant

**Solution:** Check for existing active charges first

```javascript
const existing = await KnexClient("subscriptions")
  .where("storeId", storeId)
  .whereIn("status", ["trial", "active"])
  .first();

if (existing) {
  return res.status(400).json({ error: "Subscription already exists" });
}
```

### Issue: Test charges in production

**Cause:** `test: true` in production environment

**Solution:** Use environment variable

```javascript
test: process.env.NODE_ENV !== "production"
```

## Webhooks (Optional)

Shopify can send webhooks for billing events:

### APP_SUBSCRIPTIONS_UPDATE

Triggered when a charge status changes.

```json
{
  "app_subscription": {
    "id": 1234567890,
    "status": "active",
    "name": "Pro Plan",
    "price": "19.00"
  }
}
```

**Setup:**
1. Register webhook in Shopify Partners dashboard
2. Create webhook handler endpoint
3. Verify webhook signature
4. Update local subscription status

## Resources

- [Shopify Billing API Docs](https://shopify.dev/docs/apps/billing)
- [Recurring Application Charges](https://shopify.dev/docs/api/admin-rest/2025-01/resources/recurringapplicationcharge)
- [App Billing Best Practices](https://shopify.dev/docs/apps/billing/best-practices)
- [Testing Billing](https://shopify.dev/docs/apps/billing/testing)

## Support

For issues with Shopify billing:
1. Check Shopify API status
2. Verify access token has billing scope
3. Review Shopify Partner dashboard for charge status
4. Check app logs for API errors
5. Contact Shopify Partner Support if needed
