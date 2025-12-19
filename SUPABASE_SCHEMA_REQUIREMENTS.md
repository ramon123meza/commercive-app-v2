# Supabase Schema Requirements

This document outlines the required database schema additions for the Commercive Shopify App.

## Backorder Locks Table

The `backorder_locks` table is required to prevent race conditions when processing backorders from concurrent webhook requests.

### SQL Migration

Run the following SQL in your Supabase SQL Editor:

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

-- Optional: Create a function to automatically clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_backorder_locks()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.backorder_locks
  WHERE expires_at < NOW();
END;
$$;

-- Optional: Create a scheduled job to run cleanup every 5 minutes
-- Note: This requires the pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-backorder-locks', '*/5 * * * *', 'SELECT cleanup_expired_backorder_locks()');
```

### Table Description

- **order_id** (BIGINT, PRIMARY KEY): The Shopify order ID being processed
- **locked_at** (TIMESTAMPTZ): When the lock was acquired
- **expires_at** (TIMESTAMPTZ): When the lock expires (typically 60 seconds after acquisition)
- **created_at** (TIMESTAMPTZ): Record creation timestamp

### How It Works

1. When a backorder webhook is received, the system attempts to insert a lock record
2. If the insert succeeds, the backorder is processed
3. If the insert fails (duplicate order_id), another process is already handling this order
4. After processing completes, the lock is deleted
5. Locks automatically expire after 60 seconds as a safety mechanism

### RLS Policies (Optional)

If using Row Level Security, you may want to add policies:

```sql
-- Allow service role to manage locks
ALTER TABLE public.backorder_locks ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (the app uses service role key)
CREATE POLICY "Service role can manage backorder locks"
ON public.backorder_locks
FOR ALL
USING (true)
WITH CHECK (true);
```

## Environment Variables

Ensure the following environment variables are set:

### Required
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SECRET_KEY` - Your Supabase service role key (not anon key)
- `SHOPIFY_API_KEY` - Shopify app API key
- `SHOPIFY_API_SECRET` - Shopify app secret
- `DATABASE_URL` - PostgreSQL connection string for Prisma session storage
- `DIRECT_URL` - Direct PostgreSQL connection string

### Optional but Recommended
- `MAILERSEND_APIKEY` - MailerSend API key for welcome emails
- `NEXT_PUBLIC_CLIENT_URL` - Dashboard URL (defaults to https://dashboard.commercive.co)

## Testing the Setup

After running the migration, verify the table was created:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'backorder_locks'
ORDER BY ordinal_position;
```

You should see 4 columns: order_id, locked_at, expires_at, created_at
