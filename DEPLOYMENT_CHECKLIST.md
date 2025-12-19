# Deployment Checklist for Commercive Shopify App v2

Use this checklist to ensure a smooth deployment of all fixes.

## Pre-Deployment Steps

### 1. Database Setup (CRITICAL - Do This First!)

Run this SQL in your Supabase SQL Editor:

```sql
-- Create backorder_locks table for race condition prevention
CREATE TABLE IF NOT EXISTS public.backorder_locks (
  order_id BIGINT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_backorder_locks_expires_at ON public.backorder_locks(expires_at);

-- Add comment
COMMENT ON TABLE public.backorder_locks IS 'Prevents race conditions when processing backorders from concurrent webhook requests';
```

Verify table creation:
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'backorder_locks'
ORDER BY ordinal_position;
```

Expected output: 4 columns (order_id, locked_at, expires_at, created_at)

### 2. Environment Variables

Ensure these are set in your deployment environment (Vercel/Railway/etc.):

**Required:**
- ✅ `SHOPIFY_API_KEY`
- ✅ `SHOPIFY_API_SECRET`
- ✅ `SHOPIFY_APP_URL`
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SECRET_KEY` (service role key, NOT anon key)
- ✅ `SUPABASE_ANON_KEY`
- ✅ `DATABASE_URL` (for Prisma session storage)
- ✅ `DIRECT_URL` (for Prisma direct connection)

**Recommended:**
- ⚠️ `MAILERSEND_APIKEY` (for welcome emails - gracefully skips if not set)
- ⚠️ `NEXT_PUBLIC_CLIENT_URL` (defaults to https://dashboard.commercive.co)

### 3. Code Review

Verify these files contain the fixes:

```bash
# Should NOT exist (was deleted)
ls app/routes/auth.callback/route.tsx
# Expected: "No such file or directory"

# Should contain retry logic
grep -n "retrySupabaseOperation" app/utils/supabaseHelpers.tsx
# Expected: Multiple matches

# Should NOT contain "|| true"
grep -n "!inventoryFetched || true" app/routes/app._index.tsx
# Expected: No matches

# Should contain disconnect implementation
grep -n "Delete webhooks from Shopify" app/routes/app._index.tsx
# Expected: Match found

# Should contain sendWelcomeEmail
grep -n "sendWelcomeEmail" app/utils/createDashboardUser.ts
# Expected: Multiple matches
```

## Deployment Steps

### 1. Deploy to Staging (If Available)

```bash
npm install
npm run build
# Deploy to staging environment
```

### 2. Test Staging Environment

- [ ] Fresh app install works
- [ ] Dashboard user auto-created in Supabase
- [ ] Welcome email received (if MailerSend configured)
- [ ] Initial inventory sync completes
- [ ] Webhooks registered in Shopify
- [ ] Process a test order
- [ ] Verify backorder lock acquired and released
- [ ] Test store disconnect
- [ ] Verify cleanup completed

### 3. Deploy to Production

```bash
# Ensure all environment variables are set
# Deploy to production
```

### 4. Post-Deployment Verification

- [ ] Monitor logs for errors
- [ ] Check Supabase `backorder_locks` table (should be empty when idle)
- [ ] Verify webhook delivery in Shopify admin
- [ ] Test app installation with real store
- [ ] Confirm welcome email sent
- [ ] Monitor error rates

## Testing Scenarios

### Test 1: Fresh App Installation
1. Install app on test store
2. Verify dashboard user created in Supabase
3. Check email for welcome message
4. Verify initial data sync completed
5. Check webhooks registered in Shopify

### Test 2: Concurrent Webhooks (Backorder Lock)
1. Create order with out-of-stock item
2. Trigger multiple webhook deliveries
3. Verify backorder count only incremented once
4. Check logs for lock acquisition/release

### Test 3: Inventory Sync (Bug Fix)
1. Install app fresh
2. Reload dashboard page multiple times
3. Check logs - inventory sync should only happen once
4. Verify subsequent loads skip sync

### Test 4: Store Disconnect
1. Click disconnect in app settings
2. Verify success message
3. Check Supabase - store record deleted
4. Check Shopify - webhooks removed
5. Verify session cleared

### Test 5: Welcome Email
1. Install app on new store
2. Wait for email (check spam folder)
3. Verify credentials work
4. Test dashboard login

### Test 6: Error Recovery
1. Temporarily break Supabase connection
2. Trigger webhook
3. Verify retry attempts in logs
4. Restore connection
5. Verify operation eventually succeeds

## Monitoring

### Key Metrics to Watch

1. **Webhook Processing Success Rate**
   - Should be >99%
   - Check Shopify webhook logs

2. **Backorder Lock Performance**
   - Watch for lock acquisition failures
   - Monitor lock table size
   - Alert if locks older than 5 minutes

3. **Email Delivery Rate**
   - Track via MailerSend dashboard
   - Should be >95%

4. **Database Query Performance**
   - Monitor Supabase slow query log
   - Watch for retry exhaustion

### Log Patterns to Monitor

**Good:**
```
[acquireBackorderLock] Lock acquired for order 123456
[saveBackorderDataToSupabase] Back order updated for variant 789 in order 123456
[releaseBackorderLock] Lock released for order 123456
```

**Bad (needs investigation):**
```
[acquireBackorderLock] Lock already exists for order 123456
[saveOrdersToSupabase] Attempt 3/3 failed
[saveOrdersToSupabase] All retry attempts exhausted
```

## Rollback Plan

If critical issues occur:

1. **Immediate Rollback:**
   ```bash
   # Revert to previous version
   git revert HEAD
   npm run build
   # Deploy previous version
   ```

2. **Partial Rollback:**
   - Remove `MAILERSEND_APIKEY` to disable emails
   - Emails will be gracefully skipped

3. **Emergency Fix:**
   - Backorder processing will work without locks (just less safe)
   - Main app functionality remains intact

## Success Criteria

Deployment is successful when:

- [ ] No errors in logs for 1 hour
- [ ] At least 3 successful app installations
- [ ] Webhooks processing correctly
- [ ] Welcome emails sending (if configured)
- [ ] No backorder race conditions observed
- [ ] Store disconnect working
- [ ] Performance metrics stable

## Support Contact

If issues arise:
- Check `FIXES_APPLIED.md` for detailed fix information
- Review `SUPABASE_SCHEMA_REQUIREMENTS.md` for database setup
- Monitor Supabase logs
- Check Shopify webhook logs
- Review application logs

---

**Ready for deployment!** ✨
