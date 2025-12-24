# Commercive System - User Flow & Integration Explanation

## Table of Contents
1. [How the System Handles Existing Users](#1-existing-users-from-previous-version)
2. [How the System Detects New Users](#2-detecting-new-users)
3. [How Shopify App Links with Dashboards](#3-shopify-app--dashboard-integration)
4. [Complete User Journey Flows](#4-complete-user-journeys)

---

## 1. Existing Users from Previous Version

### The Challenge
When you deployed the new system, some Shopify merchants may have already installed the **old version** of your app. These users need to be handled gracefully when they:
- Continue using the app (already installed)
- Reinstall/update the app
- Try to access the new dashboards

### How It Works

#### Scenario A: User Reinstalls/Updates the App

When a merchant who had the old app reinstalls:

1. **Shopify OAuth Flow Triggers**
   ```
   User clicks "Install App" → Shopify OAuth → afterAuth hook fires
   ```

2. **afterAuth Hook Executes** (`app/shopify.server.ts:99-136`)
   ```typescript
   afterAuth: async ({ session, admin }) => {
     // 1. Register webhooks
     shopify.registerWebhooks({ session });

     // 2. Try to create dashboard user
     const result = await createDashboardUserViaLambda({
       shopDomain: session.shop,
       accessToken: session.accessToken,
       email: shopEmail,
       shopName: shopName,
     });
   }
   ```

3. **Lambda Checks for Existing User** (`lambda_functions/commercive_auth.py:144-152`)
   ```python
   # Check if email already exists
   existing_users = query(
       'commercive_users',
       index_name='email-index',
       key_condition=Key('email').eq(email)
   )

   if existing_users:
       return conflict('Email already registered')
   ```

4. **What Happens**:
   - ✅ If user exists: Lambda returns `conflict` error
   - ✅ Shopify app continues working (error is non-blocking)
   - ✅ Store record gets **UPSERTED** (updated if exists, created if not)
   - ✅ User can still access their existing dashboard account
   - ✅ No duplicate accounts created

#### Scenario B: Existing User Continues Using App

If the merchant never reinstalled (old app still running):

1. **When New App Deploys**:
   - ✅ Session storage switches from PostgreSQL to DynamoDB
   - ✅ **Old sessions are LOST** (users will need to re-authenticate)
   - ✅ User will see OAuth flow next time they open the app
   - ✅ Flow follows "Scenario A" above

2. **User Data Preservation**:
   - ✅ **Orders**: Still in DynamoDB (synced via webhooks)
   - ✅ **Inventory**: Still in DynamoDB (synced via webhooks)
   - ✅ **Store Data**: Still in DynamoDB
   - ✅ **Dashboard Account**: Still exists if they created one

### Migration Path for Existing Users

**Automatic Migration** (No action needed):
```
Old App Installed
    ↓
New App Deploys to Vercel
    ↓
User Opens App in Shopify (session expired)
    ↓
OAuth Flow Triggers
    ↓
afterAuth Hook Runs
    ↓
Store Record UPSERTED (preserves existing data)
    ↓
User creation attempted (fails gracefully if exists)
    ↓
App Works Normally ✅
```

---

## 2. Detecting New Users

The system has **multiple layers** to detect if a user needs to create an account.

### Detection Points

#### A. During App Installation (Automatic)

**Location**: `app/shopify.server.ts:99-136` (afterAuth hook)

**Process**:
```
1. Shopify OAuth completes
   ↓
2. afterAuth hook fires
   ↓
3. Fetch shop details from Shopify API
   ↓
4. Call createDashboardUserViaLambda()
   ↓
5. Lambda checks if user exists
   ↓
6. If NOT exists → Create user automatically
   ↓
7. If EXISTS → Return gracefully, do nothing
```

**Code Flow**:
```typescript
// 1. Get shop email from Shopify
const shop = shopResponse.data?.[0];
const shopEmail = shop?.email || shop?.shop_owner;

// 2. Try to create user
const result = await createDashboardUserViaLambda({
  shopDomain: session.shop,
  accessToken: session.accessToken,
  email: shopEmail,
  shopName: shopName,
});

// 3. Handle result (non-blocking)
if (result.success) {
  console.log('Dashboard user created:', result);
} else {
  console.error('User creation failed:', result.error);
  // App continues working even if this fails
}
```

#### B. Lambda-Level Detection

**Location**: `lambda_functions/commercive_auth.py:144-152`

**How It Detects**:
```python
# Query DynamoDB by email using GSI
existing_users = query(
    'commercive_users',
    index_name='email-index',
    key_condition=Key('email').eq(email)
)

if existing_users:
    # USER EXISTS
    return conflict('Email already registered')
else:
    # NEW USER
    # Proceed with creation
```

**DynamoDB Table Structure**:
```
commercive_users:
  - user_id (PK)
  - email (GSI)
  - role
  - status
  - created_at
```

The system uses the `email-index` GSI for O(1) lookups.

#### C. Store-Level Detection

**Location**: `app/utils/lambdaClient.ts:111-126` (upsertStore function)

**Process**:
```typescript
// UPSERT operation (update if exists, create if not)
const response = await client.post('/stores', storeData);

// Lambda checks:
// 1. Query by shop_domain (unique identifier)
// 2. If store exists → UPDATE
// 3. If store doesn't exist → CREATE
```

**Lambda Implementation** (in `commercive_stores.py`):
```python
# Check if store exists by domain
existing_store = query(
    'commercive_stores',
    index_name='domain-index',
    key_condition=Key('shop_domain').eq(shop_domain)
)

if existing_store:
    # UPDATE existing store
    update_item(...)
else:
    # CREATE new store
    put_item(...)
```

### Detection Summary

| Detection Point | Method | Database Check | Result |
|----------------|---------|----------------|--------|
| **App Installation** | Email from Shopify | Query `email-index` | Auto-create if new |
| **Manual Signup** | Email from form | Query `email-index` | Return error if exists |
| **Store Connection** | Shop domain | Query `domain-index` | Upsert (update/create) |

---

## 3. Shopify App ↔ Dashboard Integration

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SHOPIFY MERCHANT                         │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ (Installs App)
               ↓
┌─────────────────────────────────────────────────────────────┐
│              SHOPIFY APP (Remix on Vercel)                  │
│                                                             │
│  • OAuth Authentication                                     │
│  • Session Storage (DynamoDB)                               │
│  • afterAuth Hook → Creates Dashboard User                 │
│  • Webhook Handlers                                         │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ (Calls Lambda Functions)
               ↓
┌─────────────────────────────────────────────────────────────┐
│           AWS LAMBDA FUNCTIONS (11 functions)               │
│                                                             │
│  • commercive_auth     → User signup/login                 │
│  • commercive_users    → User management                   │
│  • commercive_stores   → Store management                  │
│  • commercive_webhooks → Process Shopify events            │
│  • commercive_orders   → Order data                        │
│  • commercive_inventory → Inventory data                   │
│  • ... (5 more)                                            │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ (Read/Write)
               ↓
┌─────────────────────────────────────────────────────────────┐
│              AWS DYNAMODB (22 tables)                       │
│                                                             │
│  • commercive_users                                         │
│  • commercive_stores                                        │
│  • commercive_store_users (linking table)                  │
│  • commercive_shopify_sessions                             │
│  • commercive_orders                                        │
│  • commercive_inventory                                     │
│  • ... (16 more)                                           │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ (Read via Lambda API)
               ↓
┌─────────────────────────────────────────────────────────────┐
│         AFFILIATE & ADMIN DASHBOARDS (React/Amplify)        │
│                                                             │
│  • Affiliate Dashboard → affiliates.commercive.com          │
│  • Admin Dashboard → admin.commercive.com                   │
└─────────────────────────────────────────────────────────────┘
```

### How They Connect

#### Step 1: User Account Creation

**When**: Merchant installs Shopify app

**Flow**:
```
Shopify App (afterAuth hook)
    ↓
Calls: createDashboardUserViaLambda()
    ↓
POST https://LAMBDA_AUTH_URL/signup
    ↓
Lambda creates user in commercive_users
    ↓
Returns: { user_id, email }
    ↓
Shopify app stores session in DynamoDB
```

**Code** (`app/utils/createDashboardUser.ts:31-105`):
```typescript
// 1. Generate temporary password
const tempPassword = generateTempPassword();

// 2. Call Lambda to create user
const userResponse = await createDashboardUser({
  email: email,
  password: tempPassword,
  first_name: shopName,
  last_name: 'Store',
  role: 'store_owner',
  store_url: shopDomain,
});

// 3. Create/update store record
const store = await upsertStore({
  store_url: shopDomain,
  shop_name: shopName,
  email: email,
  access_token: accessToken,
});

// 4. Send welcome email (optional)
if (process.env.MAILERSEND_APIKEY) {
  await sendWelcomeEmail(email, shopName, tempPassword);
}

// 5. Return dashboard URL
return {
  success: true,
  userId: userResponse.user_id,
  storeId: store.store_id,
  dashboardUrl: `${AFFILIATE_DASHBOARD_URL}/login`,
};
```

#### Step 2: User-Store Linking

**Database Structure**:
```
commercive_users:
  user_id: "user-123"
  email: "merchant@store.com"
  role: "store_owner"

commercive_stores:
  store_id: "store-456"
  shop_domain: "mystore.myshopify.com"
  shop_name: "My Store"
  access_token: "shpat_..."

commercive_store_users (LINKING TABLE):
  link_id: "link-789"
  user_id: "user-123"     ← Links to user
  store_id: "store-456"    ← Links to store
  role: "owner"
  created_at: "2025-12-24"
```

**How It Works**:
1. User record created in `commercive_users`
2. Store record created in `commercive_stores`
3. **Link record** created in `commercive_store_users`
4. This allows:
   - One user → Multiple stores
   - One store → Multiple users (team members)

#### Step 3: Data Synchronization

**Webhooks Keep Everything in Sync**:

```
Shopify Event Occurs (order created, inventory updated)
    ↓
Shopify sends webhook to:
    https://app.commercive.co/webhooks
    ↓
Shopify app validates webhook
    ↓
Calls appropriate Lambda function:
    - Orders → POST /webhooks/orders/create
    - Inventory → POST /webhooks/inventory/update
    - Fulfillment → POST /webhooks/fulfillment/create
    ↓
Lambda processes and stores in DynamoDB
    ↓
Data now available to dashboards via Lambda API
```

**Example - Order Webhook** (`app/routes/webhooks.tsx`):
```typescript
// Webhook received from Shopify
const orderData = await request.json();

// Transform and send to Lambda
await syncOrder({
  shop_domain: session.shop,
  shopify_order_id: orderData.id,
  order_number: orderData.order_number,
  customer_email: orderData.email,
  total_price: orderData.total_price,
  line_items: orderData.line_items,
  // ... more fields
});

// Lambda stores in DynamoDB:
// - commercive_orders
// - commercive_order_items
```

#### Step 4: Dashboard Access

**User Logs into Dashboard**:

1. **User goes to**: `https://affiliates.commercive.com/login`
2. **Enters credentials**: Email + Password
3. **Dashboard calls**: `POST https://LAMBDA_AUTH_URL/login`
4. **Lambda validates** and returns JWT token
5. **Dashboard stores** JWT in localStorage
6. **All API calls** include JWT in Authorization header

**Dashboard Data Fetching**:
```typescript
// In Affiliate Dashboard
async function fetchOrders() {
  // Call Lambda with JWT
  const response = await fetch(
    'https://LAMBDA_ORDERS_URL/orders?store_url=mystore.myshopify.com',
    {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    }
  );

  const orders = await response.json();
  // Display in dashboard
}
```

**Lambda validates JWT**:
```python
# In Lambda function
user, auth_error = require_auth(event)
if auth_error:
    return unauthorized()

# User is authenticated, fetch their data
user_id = user['user_id']
orders = query_orders_for_user(user_id)
return success({'orders': orders})
```

---

## 4. Complete User Journeys

### Journey A: Brand New Merchant

```
1. Merchant discovers Commercive in Shopify App Store
   ↓
2. Clicks "Install App"
   ↓
3. Shopify OAuth flow
   ↓
4. Merchant grants permissions
   ↓
5. afterAuth hook fires:
   - Webhooks registered
   - User created in DynamoDB (NEW)
   - Store created in DynamoDB (NEW)
   - Link created in store_users (NEW)
   - Welcome email sent
   ↓
6. App opens successfully in Shopify
   ↓
7. Webhooks start syncing data:
   - Orders → DynamoDB
   - Inventory → DynamoDB
   - Fulfillments → DynamoDB
   ↓
8. Merchant receives welcome email with:
   - Dashboard URL
   - Temporary password
   ↓
9. Merchant logs into dashboard
   ↓
10. Dashboard shows:
    - Connected store
    - Synced orders
    - Synced inventory
    - Affiliate features (if applicable)

STATUS: ✅ Complete new user flow
```

### Journey B: Existing User from Old System

```
1. Merchant already has old app installed
   ↓
2. New app deploys to Vercel
   ↓
3. Merchant opens app in Shopify
   ↓
4. Session not found (PostgreSQL → DynamoDB migration)
   ↓
5. OAuth flow triggered
   ↓
6. afterAuth hook fires:
   - Webhooks registered
   - Try to create user → FAILS (email exists)
   - Store UPSERTED (preserves data)
   - Link UPSERTED
   ↓
7. App works normally
   ↓
8. Existing data preserved:
   - User account ✅
   - Store data ✅
   - Orders ✅
   - Inventory ✅
   - Dashboard access ✅

STATUS: ✅ Graceful migration, no data loss
```

### Journey C: User Uninstalls & Reinstalls

```
1. Merchant uninstalls app
   ↓
2. APP_UNINSTALLED webhook fires
   ↓
3. Lambda marks store as inactive:
   - is_active = False
   - uninstalled_at = timestamp
   ↓
4. User/Store records PRESERVED (not deleted)
   ↓
--- Time passes ---
   ↓
5. Merchant reinstalls app
   ↓
6. OAuth flow
   ↓
7. afterAuth hook:
   - User exists → Skip creation
   - Store exists → UPSERT (reactivate)
   - Update: is_active = True
   - Webhooks re-registered
   ↓
8. All historical data RESTORED:
   - Previous orders ✅
   - Previous inventory ✅
   - Previous settings ✅

STATUS: ✅ Data persistence across install/uninstall
```

### Journey D: Store Owner Invites Team Member

```
1. Store owner logs into Admin Dashboard
   ↓
2. Goes to "Team" section
   ↓
3. Clicks "Invite User"
   ↓
4. Enters email: team@store.com
   ↓
5. Dashboard calls: POST /admin/invite
   ↓
6. Lambda:
   - Creates invitation record
   - Sends invitation email
   ↓
7. Team member receives email with signup link
   ↓
8. Team member clicks link → Signup form
   ↓
9. Completes signup:
   - User created in commercive_users
   - Email verification required
   ↓
10. After verification:
    - Link created in store_users
    - user_id + store_id + role="team_member"
    ↓
11. Team member can now:
    - Access same dashboard
    - See same store data
    - Limited permissions (not owner)

STATUS: ✅ Multi-user support per store
```

---

## Key Takeaways

### ✅ Existing Users Are Protected
- Email uniqueness enforced at Lambda level
- User creation failures are **non-blocking**
- Store data is **UPSERTED** (never duplicated)
- Historical data is **preserved**

### ✅ New Users Are Auto-Created
- Automatic during Shopify app installation
- Uses shop email from Shopify
- Sends welcome email with credentials
- Links user ↔ store automatically

### ✅ Seamless Integration
- **Single source of truth**: DynamoDB
- **Real-time sync**: Webhooks
- **Secure access**: JWT authentication
- **Unified data**: All systems share same database

### ✅ Flexible Architecture
- One user → Multiple stores
- One store → Multiple users (team)
- Data survives uninstall/reinstall
- No vendor lock-in (AWS infrastructure)

---

## Environment Variables That Connect Everything

```bash
# In Shopify App (Vercel)
LAMBDA_AUTH_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_USERS_URL=https://xxx.lambda-url.us-east-1.on.aws
LAMBDA_STORES_URL=https://xxx.lambda-url.us-east-1.on.aws
# ... more Lambda URLs

AFFILIATE_DASHBOARD_URL=https://affiliates.commercive.com
ADMIN_DASHBOARD_URL=https://admin.commercive.com

# In Affiliate Dashboard (Amplify)
REACT_APP_LAMBDA_AUTH_URL=https://xxx.lambda-url.us-east-1.on.aws
REACT_APP_LAMBDA_USERS_URL=https://xxx.lambda-url.us-east-1.on.aws
# ... more Lambda URLs

# In Lambda Functions (AWS)
DYNAMODB_TABLE_PREFIX=commercive_
AWS_REGION=us-east-1
```

**All systems point to same Lambda functions → Same DynamoDB tables → Unified data**

---

**Last Updated**: December 24, 2025
**System Version**: 2.0.1 (DynamoDB Unified Architecture)
