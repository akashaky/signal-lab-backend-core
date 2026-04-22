# Billing System Documentation - Shopify Billing API

## Overview

This billing system uses **Shopify's native Billing API** to provide subscription management with a 21-day free trial followed by a $19/month subscription. All payments are processed through Shopify, ensuring seamless integration with your Shopify app.

## Features

- ✅ 21-day free trial for new users
- ✅ $19/month subscription after trial
- ✅ Native Shopify billing integration
- ✅ Automatic charge creation and activation
- ✅ Subscription status tracking (trial, active, expired, cancelled, past_due)
- ✅ Billing history and event logging
- ✅ Subscription cancellation through Shopify API
- ✅ Middleware for subscription validation

## How Shopify Billing Works

### Shopify Recurring Application Charges

Shopify provides a **Recurring Application Charge** API that allows apps to charge merchants on a recurring basis. The flow is:

1. **Create Charge**: App creates a recurring charge with trial period
2. **Merchant Approval**: Shopify redirects merchant to approve the charge
3. **Activate Charge**: After approval, app activates the charge
4. **Automatic Billing**: Shopify handles all recurring billing automatically

### Benefits of Shopify Billing

- ✅ **No PCI Compliance**: Shopify handles all payment processing
- ✅ **Merchant Trust**: Billing appears in Shopify admin
- ✅ **Automatic Collection**: Shopify collects payments automatically
- ✅ **Built-in Retry Logic**: Shopify retries failed payments
- ✅ **Unified Billing**: Merchants see app charges with other Shopify bills

## Database Schema

### Tables Created

#### 1. `subscription_plans`
Stores available subscription plans.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| name | VARCHAR(50) | Plan name (e.g., "Pro Plan") |
| priceInCents | INT | Price in cents (1900 = $19.00) |
| trialDays | INT | Trial period in days (default: 21) |
| features | TEXT | JSON string of features |
| isActive | TINYINT | Whether plan is active |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Update timestamp |

#### 2. `subscriptions`
Tracks user subscriptions and Shopify charges.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| storeId | INT | Foreign key to shopifyStore |
| planId | INT | Foreign key to subscription_plans |
| status | ENUM | trial, active, cancelled, expired, past_due |
| trialStartedAt | TIMESTAMP | When trial started |
| trialEndsAt | TIMESTAMP | When trial ends |
| currentPeriodStart | TIMESTAMP | Current billing period start |
| currentPeriodEnd | TIMESTAMP | Current billing period end |
| cancelledAt | TIMESTAMP | When subscription was cancelled |
| shopifyChargeId | BIGINT | Shopify recurring charge ID |
| confirmationUrl | TEXT | Shopify confirmation URL for merchant |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Update timestamp |

#### 3. `billing_events`
Audit trail for all billing events.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| storeId | INT | Foreign key to shopifyStore |
| subscriptionId | INT | Foreign key to subscriptions |
| type | ENUM | Event type (see below) |
| amountInCents | INT | Amount in cents |
| metadata | TEXT | JSON string with additional data |
| eventAt | TIMESTAMP | When event occurred |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Update timestamp |

**Event Types:**
- `trial_started` - Trial period initiated
- `trial_ending_soon` - Trial ending reminder
- `trial_ended` - Trial period expired
- `subscription_created` - Paid subscription activated
- `charge_attempted` - Payment attempt initiated
- `charge_succeeded` - Payment successful
- `charge_failed` - Payment failed
- `subscription_cancelled` - Subscription cancelled
- `subscription_renewed` - Subscription renewed

#### 4. `payment_methods`
Stores customer payment methods.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| storeId | INT | Foreign key to shopifyStore |
| stripePaymentMethodId | VARCHAR(100) | Stripe payment method ID |
| cardBrand | VARCHAR(20) | Card brand (visa, mastercard, etc.) |
| cardLast4 | VARCHAR(4) | Last 4 digits of card |
| cardExpMonth | INT | Card expiration month |
| cardExpYear | INT | Card expiration year |
| isDefault | TINYINT | Whether this is the default payment method |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Update timestamp |

## API Endpoints

### 1. GET `/api/billing/status`
Get current subscription status for the authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "hasSubscription": true,
  "status": "trial",
  "plan": {
    "id": 1,
    "name": "Pro Plan",
    "price": 19,
    "priceInCents": 1900,
    "features": ["Full analytics access", "Unlimited products", "Priority support", "Advanced reporting"]
  },
  "trial": {
    "isActive": true,
    "startedAt": "2024-01-01T00:00:00.000Z",
    "endsAt": "2024-01-22T00:00:00.000Z",
    "daysRemaining": 15
  },
  "currentPeriod": {
    "start": null,
    "end": null
  },
  "cancelledAt": null,
  "paymentMethod": null
}
```

### 2. POST `/api/billing/start-trial`
Start a 21-day free trial.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": 1,
    "status": "trial",
    "trialEndsAt": "2024-01-22T00:00:00.000Z",
    "plan": {
      "name": "Pro Plan",
      "price": 19
    }
  }
}
```

### 3. POST `/api/billing/subscribe`
Convert trial to paid subscription or create new subscription.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "paymentMethodId": "pm_1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": 1,
    "status": "active",
    "currentPeriodEnd": "2024-02-01T00:00:00.000Z"
  }
}
```

### 4. POST `/api/billing/cancel`
Cancel subscription.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "immediate": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription will cancel at period end"
}
```

### 5. GET `/api/billing/plans`
Get all available subscription plans.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "plans": [
    {
      "id": 1,
      "name": "Pro Plan",
      "price": 19,
      "priceInCents": 1900,
      "trialDays": 21,
      "features": ["Full analytics access", "Unlimited products", "Priority support", "Advanced reporting"]
    }
  ]
}
```

### 6. GET `/api/billing/history`
Get billing history for the authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "events": [
    {
      "id": 1,
      "type": "trial_started",
      "amount": null,
      "eventAt": "2024-01-01T00:00:00.000Z",
      "metadata": {
        "planId": 1,
        "trialDays": 21,
        "trialEndsAt": "2024-01-22T00:00:00.000Z"
      }
    }
  ]
}
```

## Middleware

### `validateSubscription`
Middleware to check if user has an active subscription or valid trial.

**Usage:**
```javascript
import validateSubscription from "./middleware/validateSubscription.js";

router.get("/protected-route", validateJWT, validateSubscription, async (req, res) => {
  // Route logic here
  // req.subscription contains the subscription object
});
```

**Error Responses:**

1. No subscription:
```json
{
  "error": "No active subscription",
  "code": "SUBSCRIPTION_REQUIRED",
  "message": "Please subscribe to access this feature"
}
```

2. Trial expired:
```json
{
  "error": "Trial expired",
  "code": "TRIAL_EXPIRED",
  "message": "Your trial has expired. Please subscribe to continue."
}
```

3. Subscription past due:
```json
{
  "error": "Subscription past due",
  "code": "SUBSCRIPTION_PAST_DUE",
  "message": "Your subscription payment is past due. Please update your payment method."
}
```

## Frontend Integration

### Billing Component
Located at: `signal-lab-admin-ui/src/component/billing/Billing.jsx`

**Features:**
- View subscription status
- Start free trial
- Subscribe with payment method
- Cancel subscription
- View billing history
- View available plans

**Navigation:**
Added to the main navigation menu with a "Billing" link.

### API Integration
Uses the existing `apiCall` helper from `signal-lab-admin-ui/src/api.js`.

## Subscription Flow

### New User Flow
1. User signs up and completes onboarding
2. User navigates to Billing page
3. User clicks "Start 21-Day Free Trial"
4. Trial subscription is created with status "trial"
5. User has 21 days to use the service
6. Before trial ends, user can subscribe with payment method
7. Subscription status changes to "active"

### Trial Expiration Flow
1. Trial ends after 21 days
2. Middleware checks trial expiration on each request
3. If expired, subscription status changes to "expired"
4. User is prompted to subscribe
5. User adds payment method and subscribes
6. Subscription status changes to "active"

### Cancellation Flow
1. User clicks "Cancel Subscription"
2. User chooses immediate cancellation or cancel at period end
3. If immediate: status changes to "cancelled" immediately
4. If at period end: `cancelledAt` is set, but status remains "active" until period end
5. At period end, status changes to "cancelled"

## Payment Integration

### Stripe Integration (TODO)
The current implementation simulates payment processing. To integrate with Stripe:

1. Install Stripe SDK:
```bash
npm install stripe
```

2. Update `billing.controller.js`:
```javascript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// In POST /api/billing/subscribe
const customer = await stripe.customers.create({
  email: user.email,
  payment_method: paymentMethodId,
  invoice_settings: { default_payment_method: paymentMethodId }
});

const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: process.env.STRIPE_PRICE_ID }],
  trial_end: 'now' // If converting from trial
});
```

3. Add webhook handler for Stripe events:
```javascript
router.post("/webhook/stripe", async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  
  // Handle events: invoice.paid, invoice.payment_failed, customer.subscription.deleted, etc.
});
```

## Environment Variables

Add to `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

## Testing

### Test Trial Flow
```bash
# Start trial
curl -X POST https://dev-api.revsignallab.com/api/billing/start-trial \
  -H "Authorization: Bearer <token>"

# Check status
curl https://dev-api.revsignallab.com/api/billing/status \
  -H "Authorization: Bearer <token>"
```

### Test Subscription Flow
```bash
# Subscribe
curl -X POST https://dev-api.revsignallab.com/api/billing/subscribe \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethodId": "pm_test_123"}'
```

### Test Cancellation
```bash
# Cancel at period end
curl -X POST https://dev-api.revsignallab.com/api/billing/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"immediate": false}'
```

## Monitoring & Maintenance

### Check Expired Trials
Run a cron job to check for expiring trials and send reminders:

```javascript
// Check trials expiring in 3 days
const expiringTrials = await KnexClient("subscriptions")
  .where("status", "trial")
  .whereBetween("trialEndsAt", [
    new Date(),
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  ]);

// Send reminder emails
```

### Check Failed Payments
Monitor `billing_events` for `charge_failed` events and follow up with customers.

### Generate Revenue Reports
```sql
SELECT 
  DATE_FORMAT(eventAt, '%Y-%m') as month,
  COUNT(*) as subscriptions,
  SUM(amountInCents) / 100 as revenue
FROM billing_events
WHERE type = 'charge_succeeded'
GROUP BY month
ORDER BY month DESC;
```

## Security Considerations

1. **JWT Validation**: All endpoints require valid JWT token
2. **Store Isolation**: Users can only access their own store's billing data
3. **Payment Method Security**: Never store full card numbers, only last 4 digits
4. **Webhook Verification**: Verify Stripe webhook signatures
5. **HTTPS Only**: All billing endpoints must use HTTPS in production

## Future Enhancements

- [ ] Multiple plan tiers (Basic, Pro, Enterprise)
- [ ] Annual billing with discount
- [ ] Usage-based billing
- [ ] Promo codes and discounts
- [ ] Invoice generation and download
- [ ] Email notifications for billing events
- [ ] Dunning management for failed payments
- [ ] Self-service plan upgrades/downgrades
- [ ] Billing portal with Stripe Customer Portal
- [ ] Tax calculation and collection
