# Billing System - Quick Start Guide

## 🚀 What's Been Created

A complete billing system with:
- **21-day free trial** for all new users
- **$19/month subscription** after trial
- Full subscription management (start, cancel, upgrade)
- Billing history and event tracking
- Trial expiration warnings
- Payment method management

## 📁 Files Created

### Backend (signal-lab-backend-core)
```
web/
├── db/
│   ├── setup.js (updated)
│   └── billing-setup.js (new)
├── middleware/
│   └── validateSubscription.js (new)
├── routes/
│   └── billing/
│       └── billing.controller.js (new)
└── index.js (updated)
```

### Frontend (signal-lab-admin-ui)
```
src/
├── component/
│   ├── billing/
│   │   ├── Billing.jsx (new)
│   │   ├── Billing.css (new)
│   │   ├── TrialBanner.jsx (new)
│   │   └── TrialBanner.css (new)
│   └── layout.jsx (updated)
└── App.jsx (updated)
```

## 🗄️ Database Tables

The system automatically creates these tables on startup:

1. **subscription_plans** - Available plans ($19/month Pro Plan)
2. **subscriptions** - User subscriptions and trial status
3. **billing_events** - Audit log of all billing events
4. **payment_methods** - Stored payment methods

## 🔌 API Endpoints

All endpoints require JWT authentication (`Authorization: Bearer <token>`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/status` | Get subscription status |
| POST | `/api/billing/start-trial` | Start 21-day free trial |
| POST | `/api/billing/subscribe` | Convert to paid subscription |
| POST | `/api/billing/cancel` | Cancel subscription |
| GET | `/api/billing/plans` | Get available plans |
| GET | `/api/billing/history` | Get billing history |

## 🎯 User Flow

### 1. New User Signs Up
```
User completes onboarding → Navigates to /billing → Clicks "Start Free Trial"
```

### 2. Trial Period (21 days)
```
User has full access → Trial banner shows days remaining → Can subscribe anytime
```

### 3. Trial Ending (Last 7 days)
```
Banner shows urgency → User clicks "Subscribe Now" → Enters payment method → Active subscription
```

### 4. Trial Expires
```
Access blocked → Banner shows "Trial Expired" → User must subscribe to continue
```

## 🎨 UI Components

### Billing Page (`/billing`)
- **Overview Tab**: Current subscription status, trial info, payment method
- **Plans Tab**: Available subscription plans
- **History Tab**: Billing event history

### Trial Banner
Automatically shows at the top of all pages when:
- Trial has 7 or fewer days remaining
- Trial has expired
- Subscription payment is past due

## 🔒 Protecting Routes

To require an active subscription for a route:

```javascript
import validateSubscription from "../../middleware/validateSubscription.js";

router.get("/premium-feature", validateJWT, validateSubscription, async (req, res) => {
  // Only users with active subscription or valid trial can access
  const subscription = req.subscription; // Available in request
  res.json({ message: "Premium content" });
});
```

## 🧪 Testing the System

### 1. Start the Backend
```bash
cd signal-lab-backend-core/web
npm install
npm run dev
```

The database tables will be created automatically on startup.

### 2. Start the Frontend
```bash
cd signal-lab-admin-ui
npm install
npm run dev
```

### 3. Test the Flow

1. **Login** with a valid token
2. **Navigate to Billing** (`/billing`)
3. **Start Trial** - Click "Start 21-Day Free Trial"
4. **Check Status** - Refresh to see trial status
5. **Subscribe** - Click "Subscribe Now" (simulated payment)
6. **View History** - Check the History tab for events

## 📊 Monitoring

### Check Active Trials
```sql
SELECT s.id, ss.myshopifyDomain, sub.trialEndsAt, 
       DATEDIFF(sub.trialEndsAt, NOW()) as days_remaining
FROM subscriptions sub
JOIN shopifyStore ss ON sub.storeId = ss.id
WHERE sub.status = 'trial'
ORDER BY sub.trialEndsAt ASC;
```

### Check Active Subscriptions
```sql
SELECT COUNT(*) as active_subscriptions
FROM subscriptions
WHERE status = 'active';
```

### Revenue Report
```sql
SELECT 
  DATE_FORMAT(eventAt, '%Y-%m') as month,
  COUNT(*) as successful_charges,
  SUM(amountInCents) / 100 as revenue_usd
FROM billing_events
WHERE type = 'charge_succeeded'
GROUP BY month
ORDER BY month DESC;
```

## 🔧 Configuration

### Change Trial Period
Edit `signal-lab-backend-core/web/db/billing-setup.js`:
```javascript
await KnexClient("subscription_plans").insert({
  name: "Pro Plan",
  priceInCents: 1900,
  trialDays: 30, // Change from 21 to 30 days
  // ...
});
```

### Change Subscription Price
```javascript
await KnexClient("subscription_plans").insert({
  name: "Pro Plan",
  priceInCents: 2900, // Change from $19 to $29
  // ...
});
```

### Change Grace Period
Edit `signal-lab-backend-core/web/middleware/validateSubscription.js`:
```javascript
// Grace period of 3 days
const gracePeriodEnd = new Date(periodEnd);
gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7); // Change from 3 to 7 days
```

## 💳 Stripe Integration (Next Steps)

The current system simulates payments. To integrate real payments:

### 1. Install Stripe
```bash
cd signal-lab-backend-core/web
npm install stripe
```

### 2. Add Environment Variables
```bash
# Add to .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

### 3. Update Frontend
```bash
cd signal-lab-admin-ui
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### 4. Implementation Guide
See `BILLING_SYSTEM.md` for detailed Stripe integration instructions.

## 🐛 Troubleshooting

### Tables Not Created
Check the console logs when starting the backend. You should see:
```
✅ Created subscription_plans table
✅ Inserted default Pro Plan
✅ Created subscriptions table
✅ Created billing_events table
✅ Created payment_methods table
```

### API Returns 401
Ensure you're passing a valid JWT token in the Authorization header:
```javascript
Authorization: Bearer <your_jwt_token>
```

### Trial Not Starting
Check the browser console for errors. Verify the API endpoint is accessible:
```bash
curl -X POST https://dev-api.revsignallab.com/api/billing/start-trial \
  -H "Authorization: Bearer <token>"
```

### Billing Page Not Loading
1. Check that the route is added in `App.jsx`
2. Verify the import path for `Billing.jsx`
3. Check browser console for errors

## 📝 Next Steps

1. **Test the complete flow** from trial to subscription
2. **Integrate Stripe** for real payment processing
3. **Set up email notifications** for trial expiration
4. **Add webhook handlers** for Stripe events
5. **Create admin dashboard** to view all subscriptions
6. **Implement usage tracking** if needed
7. **Add invoice generation** for paid subscriptions

## 📚 Additional Resources

- Full documentation: `BILLING_SYSTEM.md`
- Stripe docs: https://stripe.com/docs
- Knex migrations: https://knexjs.org/guide/migrations.html

## 🆘 Support

If you encounter issues:
1. Check the console logs (backend and frontend)
2. Verify database tables were created
3. Test API endpoints with curl
4. Review the full documentation in `BILLING_SYSTEM.md`
