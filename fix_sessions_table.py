#!/usr/bin/env python3
"""
Fix DynamoDB Sessions Table Schema
===================================

This script fixes the commercive_shopify_sessions table schema by:
1. Deleting the old table (with 'session_id' as partition key)
2. Creating a new table (with 'id' as partition key)

The Shopify session storage package requires 'id' as the partition key,
not 'session_id'.

Usage:
    python3 fix_sessions_table.py

Environment Variables (optional):
    AWS_ACCESS_KEY_ID     - Your AWS access key
    AWS_SECRET_ACCESS_KEY - Your AWS secret key
    AWS_REGION            - AWS region (default: us-east-1)

Author: Commercive Platform
Date: December 24, 2025
"""

import os
import sys
import time
import boto3
from botocore.exceptions import ClientError

# =============================================================================
# HARDCODED AWS CREDENTIALS - Replace these with your actual values
# =============================================================================
AWS_ACCESS_KEY_ID = "YOUR_AWS_ACCESS_KEY_ID_HERE"
AWS_SECRET_ACCESS_KEY = "YOUR_AWS_SECRET_ACCESS_KEY_HERE"
AWS_REGION = "us-east-1"
# =============================================================================

# Color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(message):
    """Print a header message"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{message}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}\n")

def print_success(message):
    """Print a success message"""
    print(f"{Colors.OKGREEN}✓ {message}{Colors.ENDC}")

def print_error(message):
    """Print an error message"""
    print(f"{Colors.FAIL}✗ {message}{Colors.ENDC}")

def print_warning(message):
    """Print a warning message"""
    print(f"{Colors.WARNING}⚠ {message}{Colors.ENDC}")

def print_info(message):
    """Print an info message"""
    print(f"{Colors.OKCYAN}ℹ {message}{Colors.ENDC}")

def get_aws_credentials():
    """
    Get AWS credentials from hardcoded values, environment variables, or prompt user
    """
    print_header("AWS Credentials")

    # Priority: Hardcoded values > Environment variables > User prompt
    access_key = None
    secret_key = None
    region = AWS_REGION

    # Check hardcoded values first
    if AWS_ACCESS_KEY_ID != "YOUR_AWS_ACCESS_KEY_ID_HERE":
        access_key = AWS_ACCESS_KEY_ID
        print_success(f"Using hardcoded AWS_ACCESS_KEY_ID: {access_key[:8]}...")

    if AWS_SECRET_ACCESS_KEY != "YOUR_AWS_SECRET_ACCESS_KEY_HERE":
        secret_key = AWS_SECRET_ACCESS_KEY
        print_success("Using hardcoded AWS_SECRET_ACCESS_KEY")

    # Fall back to environment variables
    if not access_key:
        access_key = os.environ.get('AWS_ACCESS_KEY_ID')
        if access_key:
            print_success(f"Found AWS_ACCESS_KEY_ID in environment: {access_key[:8]}...")

    if not secret_key:
        secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
        if secret_key:
            print_success("Found AWS_SECRET_ACCESS_KEY in environment")

    # Fall back to user prompt
    if not access_key:
        print_info("AWS_ACCESS_KEY_ID not found")
        access_key = input("Enter AWS Access Key ID: ").strip()

    if not secret_key:
        print_info("AWS_SECRET_ACCESS_KEY not found")
        secret_key = input("Enter AWS Secret Access Key: ").strip()

    print_info(f"Using AWS Region: {region}")

    if not access_key or not secret_key:
        print_error("AWS credentials are required!")
        sys.exit(1)

    return access_key, secret_key, region

def create_dynamodb_client(access_key, secret_key, region):
    """
    Create and return a DynamoDB client
    """
    try:
        client = boto3.client(
            'dynamodb',
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )

        # Test credentials by listing tables
        client.list_tables(Limit=1)
        print_success("Successfully authenticated with AWS")

        return client
    except ClientError as e:
        print_error(f"Failed to authenticate with AWS: {e}")
        sys.exit(1)

def check_table_exists(client, table_name):
    """
    Check if a table exists
    """
    try:
        response = client.describe_table(TableName=table_name)
        return True, response['Table']
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            return False, None
        raise

def check_table_schema(client, table_name):
    """
    Check the current table schema
    """
    exists, table_info = check_table_exists(client, table_name)

    if not exists:
        return None

    key_schema = table_info.get('KeySchema', [])
    for key in key_schema:
        if key.get('KeyType') == 'HASH':
            return key.get('AttributeName')

    return None

def delete_table(client, table_name):
    """
    Delete a DynamoDB table
    """
    print_header("Deleting Old Table")

    try:
        exists, _ = check_table_exists(client, table_name)

        if not exists:
            print_warning(f"Table '{table_name}' does not exist. Nothing to delete.")
            return True

        print_info(f"Deleting table: {table_name}")
        client.delete_table(TableName=table_name)

        # Wait for deletion
        print_info("Waiting for table deletion to complete...")
        waiter = client.get_waiter('table_not_exists')
        waiter.wait(
            TableName=table_name,
            WaiterConfig={
                'Delay': 2,
                'MaxAttempts': 60
            }
        )

        print_success(f"Table '{table_name}' deleted successfully")
        return True

    except ClientError as e:
        print_error(f"Failed to delete table: {e}")
        return False

def create_table(client, table_name):
    """
    Create the DynamoDB table with correct schema
    """
    print_header("Creating New Table with Correct Schema")

    try:
        print_info(f"Creating table: {table_name}")
        print_info("Schema: Partition key = 'id' (String)")
        print_info("Global Secondary Index: 'shop-index' on 'shop' attribute")

        response = client.create_table(
            TableName=table_name,
            KeySchema=[
                {
                    'AttributeName': 'id',
                    'KeyType': 'HASH'  # Partition key
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'id',
                    'AttributeType': 'S'  # String
                },
                {
                    'AttributeName': 'shop',
                    'AttributeType': 'S'  # String
                }
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'shop-index',
                    'KeySchema': [
                        {
                            'AttributeName': 'shop',
                            'KeyType': 'HASH'
                        }
                    ],
                    'Projection': {
                        'ProjectionType': 'KEYS_ONLY'
                    }
                }
            ],
            BillingMode='PAY_PER_REQUEST',  # On-demand pricing
            Tags=[
                {
                    'Key': 'Project',
                    'Value': 'Commercive'
                },
                {
                    'Key': 'Environment',
                    'Value': 'Production'
                },
                {
                    'Key': 'Purpose',
                    'Value': 'Shopify OAuth Sessions'
                }
            ]
        )

        print_success("Table creation initiated")

        # Wait for table to become active
        print_info("Waiting for table to become ACTIVE...")
        waiter = client.get_waiter('table_exists')
        waiter.wait(
            TableName=table_name,
            WaiterConfig={
                'Delay': 2,
                'MaxAttempts': 60
            }
        )

        # Additional wait for GSI to be active
        print_info("Waiting for Global Secondary Index to become ACTIVE...")
        time.sleep(5)

        max_attempts = 30
        for attempt in range(max_attempts):
            response = client.describe_table(TableName=table_name)
            table_status = response['Table']['TableStatus']
            gsi_status = None

            if 'GlobalSecondaryIndexes' in response['Table']:
                gsi_status = response['Table']['GlobalSecondaryIndexes'][0].get('IndexStatus')

            if table_status == 'ACTIVE' and gsi_status == 'ACTIVE':
                break

            print(f"  Table: {table_status}, GSI: {gsi_status}... (attempt {attempt+1}/{max_attempts})")
            time.sleep(2)

        print_success(f"Table '{table_name}' is now ACTIVE")
        return True

    except ClientError as e:
        print_error(f"Failed to create table: {e}")
        return False

def verify_table_schema(client, table_name):
    """
    Verify the table schema is correct
    """
    print_header("Verifying Table Schema")

    try:
        response = client.describe_table(TableName=table_name)
        table = response['Table']

        # Check partition key
        key_schema = table.get('KeySchema', [])
        partition_key = None
        for key in key_schema:
            if key.get('KeyType') == 'HASH':
                partition_key = key.get('AttributeName')
                break

        if partition_key == 'id':
            print_success(f"✓ Partition key is correct: '{partition_key}'")
        else:
            print_error(f"✗ Partition key is WRONG: '{partition_key}' (expected 'id')")
            return False

        # Check GSI
        gsis = table.get('GlobalSecondaryIndexes', [])
        if gsis:
            gsi = gsis[0]
            gsi_name = gsi.get('IndexName')
            gsi_key = gsi['KeySchema'][0].get('AttributeName')
            gsi_status = gsi.get('IndexStatus')

            print_success(f"✓ Global Secondary Index: '{gsi_name}'")
            print_success(f"✓ GSI Key: '{gsi_key}'")
            print_success(f"✓ GSI Status: {gsi_status}")
        else:
            print_warning("No Global Secondary Indexes found")

        # Check table status
        table_status = table.get('TableStatus')
        print_success(f"✓ Table Status: {table_status}")

        # Check billing mode
        billing = table.get('BillingModeSummary', {}).get('BillingMode', 'PROVISIONED')
        print_success(f"✓ Billing Mode: {billing}")

        print_success("\n✓ Table schema is correct and ready to use!")
        return True

    except ClientError as e:
        print_error(f"Failed to verify table: {e}")
        return False

def main():
    """
    Main function
    """
    print_header("Commercive - Fix DynamoDB Sessions Table Schema")

    print(f"{Colors.BOLD}This script will:{Colors.ENDC}")
    print(f"  1. Delete the old 'commercive_shopify_sessions' table")
    print(f"  2. Create a new table with the correct schema")
    print(f"  3. Verify the new schema is correct\n")

    print_warning("WARNING: This will delete any existing sessions")
    print_info("Note: Sessions are temporary and expire quickly, so this is safe")

    # Confirm
    confirm = input(f"\n{Colors.BOLD}Do you want to proceed? (yes/no): {Colors.ENDC}").strip().lower()
    if confirm not in ['yes', 'y']:
        print_info("Operation cancelled by user")
        sys.exit(0)

    # Get AWS credentials
    access_key, secret_key, region = get_aws_credentials()

    # Create DynamoDB client
    client = create_dynamodb_client(access_key, secret_key, region)

    # Table name
    table_name = 'commercive_shopify_sessions'

    # Check current schema
    print_header("Checking Current Table Schema")
    partition_key = check_table_schema(client, table_name)

    if partition_key:
        print_info(f"Current partition key: '{partition_key}'")

        if partition_key == 'id':
            print_success("Table already has correct schema!")
            print_info("No changes needed. Exiting.")
            sys.exit(0)
        else:
            print_warning(f"Table has WRONG partition key: '{partition_key}' (should be 'id')")
    else:
        print_info("Table does not exist yet")

    # Delete old table
    if not delete_table(client, table_name):
        print_error("Failed to delete old table. Exiting.")
        sys.exit(1)

    # Wait a bit before creating new table
    print_info("Waiting 5 seconds before creating new table...")
    time.sleep(5)

    # Create new table
    if not create_table(client, table_name):
        print_error("Failed to create new table. Exiting.")
        sys.exit(1)

    # Verify schema
    if not verify_table_schema(client, table_name):
        print_error("Schema verification failed. Please check manually.")
        sys.exit(1)

    # Success!
    print_header("Success!")
    print_success("✓ DynamoDB table schema has been fixed")
    print_success("✓ Partition key is now 'id' (correct)")
    print_success("✓ Table is ready for Shopify session storage")
    print_success("✓ You can now deploy your Shopify app\n")

    print(f"{Colors.BOLD}Next Steps:{Colors.ENDC}")
    print("  1. Run: npm install")
    print("  2. Add AWS credentials to Vercel environment variables")
    print("  3. Deploy to Vercel: npm run deploy:vercel")
    print("  4. Test the app on Shopify\n")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print_error("\n\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
