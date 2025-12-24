# CRITICAL: DynamoDB Table Schema Fix Required

## Issue

The `commercive_shopify_sessions` table was created with the wrong partition key name:
- ❌ **Current**: `session_id`
- ✅ **Required**: `id`

The Shopify session storage package **requires** the partition key to be named `id`, not `session_id`.

## Impact

Without this fix:
- Session storage will FAIL
- Users cannot authenticate
- App will return 500 errors
- OAuth flow will break

## Fix Required

You need to update the table schema. Here are your options:

---

## Option 1: Update setup_database.py and Recreate Table (RECOMMENDED)

### Step 1: Update the Script

In `/home/rcardonameza/_full_system_commercive/CLAUDE_AUTONOMOUS_PROJECT/scripts/setup_database.py`:

**Find this section** (around line 702-722):

```python
{
    'name': 'commercive_shopify_sessions',
    'key_schema': [
        {'AttributeName': 'session_id', 'KeyType': 'HASH'}  # ❌ WRONG
    ],
    'attribute_definitions': [
        {'AttributeName': 'session_id', 'AttributeType': 'S'},  # ❌ WRONG
        {'AttributeName': 'shop', 'AttributeType': 'S'},
        {'AttributeName': 'created_at', 'AttributeType': 'S'}
    ],
    'gsis': [
        {
            'IndexName': 'shop-sessions-index',
            'KeySchema': [
                {'AttributeName': 'shop', 'KeyType': 'HASH'},
                {'AttributeName': 'created_at', 'KeyType': 'RANGE'}
            ],
            'Projection': {'ProjectionType': 'ALL'}
        }
    ]
}
```

**Replace with**:

```python
{
    'name': 'commercive_shopify_sessions',
    'key_schema': [
        {'AttributeName': 'id', 'KeyType': 'HASH'}  # ✅ CORRECT
    ],
    'attribute_definitions': [
        {'AttributeName': 'id', 'AttributeType': 'S'},  # ✅ CORRECT
        {'AttributeName': 'shop', 'AttributeType': 'S'}
    ],
    'gsis': [
        {
            'IndexName': 'shop-index',
            'KeySchema': [
                {'AttributeName': 'shop', 'KeyType': 'HASH'}
            ],
            'Projection': {'ProjectionType': 'KEYS_ONLY'}
        }
    ]
}
```

### Step 2: Delete Old Table

```bash
cd /home/rcardonameza/_full_system_commercive/CLAUDE_AUTONOMOUS_PROJECT/scripts

# Delete only the sessions table
python3 << 'EOF'
import boto3
dynamodb = boto3.client('dynamodb', region_name='us-east-1')
try:
    dynamodb.delete_table(TableName='commercive_shopify_sessions')
    print("✓ Table deleted")
except Exception as e:
    print(f"Error: {e}")
EOF
```

### Step 3: Recreate Table

```bash
# Run setup script for just the sessions table
python3 << 'EOF'
import boto3
import time

dynamodb = boto3.client('dynamodb', region_name='us-east-1')

# Create table with correct schema
dynamodb.create_table(
    TableName='commercive_shopify_sessions',
    KeySchema=[
        {'AttributeName': 'id', 'KeyType': 'HASH'}
    ],
    AttributeDefinitions=[
        {'AttributeName': 'id', 'AttributeType': 'S'},
        {'AttributeName': 'shop', 'AttributeType': 'S'}
    ],
    GlobalSecondaryIndexes=[
        {
            'IndexName': 'shop-index',
            'KeySchema': [
                {'AttributeName': 'shop', 'KeyType': 'HASH'}
            ],
            'Projection': {'ProjectionType': 'KEYS_ONLY'}
        }
    ],
    BillingMode='PAY_PER_REQUEST',
    Tags=[
        {'Key': 'Project', 'Value': 'Commercive'},
        {'Key': 'Environment', 'Value': 'Production'}
    ]
)

print("✓ Table created with correct schema!")
print("Waiting for table to become active...")

# Wait for table to be active
waiter = dynamodb.get_waiter('table_exists')
waiter.wait(TableName='commercive_shopify_sessions')

print("✓ Table is ready!")
EOF
```

---

## Option 2: Quick Fix via AWS Console (FASTER)

### Step 1: Delete Old Table
1. Go to AWS Console → DynamoDB → Tables
2. Select `commercive_shopify_sessions`
3. Click "Delete table"
4. Confirm deletion

### Step 2: Create New Table

1. Click "Create table"
2. **Table name**: `commercive_shopify_sessions`
3. **Partition key**: `id` (String)
4. Click "Create table"

### Step 3: Add Global Secondary Index

1. Open the table
2. Go to "Indexes" tab
3. Click "Create index"
4. **Partition key**: `shop` (String)
5. **Index name**: `shop-index`
6. **Projected attributes**: Keys only
7. Click "Create index"

---

## Verification

After fixing, verify the table schema:

```bash
aws dynamodb describe-table --table-name commercive_shopify_sessions --region us-east-1 | grep -A 5 "KeySchema"
```

Should show:
```json
"KeySchema": [
    {
        "AttributeName": "id",
        "KeyType": "HASH"
    }
]
```

---

## Why This Fix is Required

The `@shopify/shopify-app-session-storage-dynamodb` package is hardcoded to use:
- Partition key: `id`
- GSI: `shop`

It doesn't support custom key names. The package will:
1. Try to read/write using `id` attribute
2. Fail because the table has `session_id` instead
3. Throw errors like "Item not found" or "Invalid parameter"

---

## Impact on Existing Data

**Don't worry**:
- This table is ONLY for Shopify OAuth sessions (temporary data)
- Sessions expire after a few hours anyway
- No historical data is stored here
- All important data (orders, inventory, users) is in other tables

Deleting and recreating this table is **safe** and has **no data loss impact**.

---

## After Fix

Once the table is fixed with `id` as the partition key:

1. ✅ Shopify sessions will store correctly
2. ✅ OAuth flow will work
3. ✅ No more 500 errors
4. ✅ App will function properly

---

**Priority**: ⚠️ **HIGH** - Must fix before deployment
**Estimated Time**: 5-10 minutes
**Data Loss Risk**: None (sessions are temporary)
