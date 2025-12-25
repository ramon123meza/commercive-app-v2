#!/usr/bin/env python3
"""
Verify DynamoDB Sessions Table Schema
======================================

Quick verification script to check if the commercive_shopify_sessions
table has the correct schema.

Usage:
    python3 verify_table.py

Author: Commercive Platform
"""

import os
import sys
import boto3
from botocore.exceptions import ClientError

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'

def verify_schema():
    """Verify the table schema"""

    # Get AWS credentials
    access_key = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    region = os.environ.get('AWS_REGION', 'us-east-1')

    if not access_key or not secret_key:
        print(f"{RED}✗ AWS credentials not found in environment{RESET}")
        print(f"{YELLOW}Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY first{RESET}")
        return False

    # Create client
    try:
        client = boto3.client(
            'dynamodb',
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )
    except Exception as e:
        print(f"{RED}✗ Failed to create DynamoDB client: {e}{RESET}")
        return False

    # Check table
    try:
        response = client.describe_table(TableName='commercive_shopify_sessions')
        table = response['Table']

        # Check partition key
        key_schema = table.get('KeySchema', [])
        partition_key = None
        for key in key_schema:
            if key.get('KeyType') == 'HASH':
                partition_key = key.get('AttributeName')
                break

        print(f"\n{BOLD}Table: commercive_shopify_sessions{RESET}")
        print(f"{'='*50}")

        if partition_key == 'id':
            print(f"{GREEN}✓ Partition Key: {partition_key} (CORRECT){RESET}")
            status = True
        else:
            print(f"{RED}✗ Partition Key: {partition_key} (WRONG - should be 'id'){RESET}")
            status = False

        # Check status
        table_status = table.get('TableStatus')
        if table_status == 'ACTIVE':
            print(f"{GREEN}✓ Table Status: {table_status}{RESET}")
        else:
            print(f"{YELLOW}⚠ Table Status: {table_status}{RESET}")
            status = False

        # Check GSI
        gsis = table.get('GlobalSecondaryIndexes', [])
        if gsis:
            gsi = gsis[0]
            gsi_name = gsi.get('IndexName')
            gsi_status = gsi.get('IndexStatus')
            print(f"{GREEN}✓ GSI: {gsi_name} ({gsi_status}){RESET}")
        else:
            print(f"{YELLOW}⚠ No Global Secondary Indexes{RESET}")

        print(f"{'='*50}\n")

        if status:
            print(f"{GREEN}{BOLD}✓ Table schema is CORRECT!{RESET}")
            print(f"{GREEN}Your Shopify app is ready to deploy.{RESET}\n")
        else:
            print(f"{RED}{BOLD}✗ Table schema is INCORRECT{RESET}")
            print(f"{YELLOW}Run: python3 fix_sessions_table.py{RESET}\n")

        return status

    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print(f"{RED}✗ Table 'commercive_shopify_sessions' does not exist{RESET}")
            print(f"{YELLOW}Run: python3 fix_sessions_table.py{RESET}\n")
        else:
            print(f"{RED}✗ Error: {e}{RESET}")
        return False

if __name__ == '__main__':
    try:
        success = verify_schema()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"{RED}✗ Unexpected error: {e}{RESET}")
        sys.exit(1)
