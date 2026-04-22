# Shopify Billing - Quick Reference

## 🚀 Quick Start

### 1. Start Backend
```bash
cd signal-lab-backend-core/web
npm run dev
```
Tables auto-create on startup.

### 2. Start Frontend
```bash
cd signal-lab-admin-ui
npm run dev
```

### 3. Test Flow
1. Login → Navigate to `/billing`
2. Click "Start 21-Day Free Trial"
3. Approve charge in Shopify admin
4. Return to app → Trial active!

## 📋 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/billing/status` | GET | Get subscription status |
| `/api/billing/start-trial` | POST | Create Shopify charge |
| `/api/billing/confirm` | GET | Handle Shopify redirect |
| `/api/billing/cancel` | POST | Cancel via Shopify |
| `/api/billing/plans` | GET | List plans |
| `/api/billing/history` | GET | Billing events |

## 🔄 Shopify Billing Flow

```
1. POST /api/billing/start-trial
   ↓
2. Creates Shopify recurring charge
   ↓
3. Returns confirmationUrl
   ↓
4. Frontend redirects to Shopify
   ↓
5. Merchant approves in Shopify admin
   ↓
6. Shopify redirects to /api/billing/confirm
   ↓
7. Backend activates charge
   ↓
8. Redirects back to app
   ↓
9. Trial active! 🎉
```

## 🗄️ Database Tables

### subscription_plans
- Default: Pro Plan ($19/month, 21-day trial)

### subscriptions
- `shopifyChargeId` - Shopify charge ID
- `confirmationUrl` - Approval URL
- `status` - trial, active, cancelled, expired

### billing_events
- Audit log of all billing activities

## 🔧 Configuration

### Test Mode (Development)
```javascript
test: process.env.NODE_ENV !== "production"
```

### Production Mode
```javascript
test: false  // Real charges
```

### Return URL
```javascript
return_url: `${process.env.HOST}/api/billing/confirm`
```

## 🧪 Testing

### Create Test Charge
```bash
curl -X POST https://dev-api.revsignallab.com/api/billing/start-trial \
  -H "Authorization: Bearer <token>"
```

### Check Status
```bash
curl https://dev-api.revsignallab.com/api/billing/status \
  -H "Authorization: Bearer <token>"
```

### Cancel Subscription
```bash
curl -X POST https://dev-api.revsignallab.com/api/billing/cancel \
  -H "Authorization: Bearer <token>"
```

## 🐛 Common Issues

### Issue: Redirect loop
**Fix:** Use `window.top.location.href` in embedded apps

### Issue: Charge not activating
**Fix:** Only activate when status is "accepted"

### Issue: Test charges in production
**Fix:** Set `test: process.env.NODE_ENV !== "production"`

## 📊 Monitoring

### Active Trials
```sql
SELECT COUNT(*) FROM subscriptions WHERE status = 'trial';
```

### Active Subscriptions
```sql
SELECT COUNT(*) FROM subscriptions WHERE status = 'active';
```

### Revenue This Month
```sql
SELECT SUM(amountInCents) / 100 as revenue
FROM billing_events
WHERE type = 'charge_succeeded'
AND MONTH(eventAt) = MONTH(NOW());
```

## 🔒 Security

- ✅ JWT authentication on all endpoints
- ✅ Store-level data isolation
- ✅ Shopify handles payment security
- ✅ No PCI compliance needed
- ✅ Audit trail for all events

## 📚 Documentation

- **Shopify Guide**: `SHOPIFY_BILLING_GUIDE.md`
- **Full Docs**: `BILLING_SYSTEM.md`
- **Quick Start**: `BILLING_QUICK_START.md`
- **Summary**: `../BILLING_IMPLEMENTATION_SUMMARY.md`

## 🎯 Key Points

1. **Shopify handles all payments** - No Stripe needed
2. **Merchant must approve** - Redirect to Shopify for approval
3. **Test mode available** - Set `test: true` in development
4. **Automatic billing** - Shopify charges monthly after trial
5. **Built-in retry** - Shopify retries failed payments

## 🚀 Production Checklist

- [ ] Set `test: false`
- [ ] Verify return URL
- [ ] Test in development store
- [ ] Monitor billing events
- [ ] Set up email notifications
- [ ] Deploy to production

## 💡 Pro Tips

1. Always use `window.top.location.href` for redirects in embedded apps
2. Check charge status before activating
3. Sync with Shopify regularly to catch status changes
4. Log all billing events for audit trail
5. Test cancellation flow thoroughly

## 🆘 Need Help?

1. Check Shopify API status
2. Verify access token has billing scope
3. Review Partner dashboard for charge status
4. Check app logs for API errors
5. See full documentation in `SHOPIFY_BILLING_GUIDE.md`

---

**Quick Links:**
- [Shopify Billing Docs](https://shopify.dev/docs/apps/billing)
- [Recurring Charges API](https://shopify.dev/docs/api/admin-rest/2025-01/resources/recurringapplicationcharge)
- [Testing Billing](https://shopify.dev/docs/apps/billing/testing)
