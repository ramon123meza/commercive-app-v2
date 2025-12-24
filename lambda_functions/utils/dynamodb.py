"""
DynamoDB helper functions for Commercive platform
"""

import boto3
import os
from typing import Dict, List, Optional, Any
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

class DynamoDBClient:
    """DynamoDB client wrapper with common operations"""

    def __init__(self):
        self.dynamodb = dynamodb

    def get_table(self, table_name: str):
        """Get a DynamoDB table resource"""
        return self.dynamodb.Table(table_name)

    def put_item(self, table_name: str, item: Dict[str, Any]) -> bool:
        """
        Insert or update an item in DynamoDB

        Args:
            table_name: Name of the table
            item: Item data (dict will be auto-converted to DynamoDB format)

        Returns:
            True if successful, False otherwise
        """
        try:
            table = self.get_table(table_name)
            # Convert float to Decimal for DynamoDB
            item = self._convert_floats(item)
            table.put_item(Item=item)
            return True
        except Exception as e:
            print(f"Error putting item in {table_name}: {e}")
            return False

    def get_item(self, table_name: str, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Get an item by primary key

        Args:
            table_name: Name of the table
            key: Primary key (e.g., {'user_id': '123'})

        Returns:
            Item dict if found, None otherwise
        """
        try:
            table = self.get_table(table_name)
            response = table.get_item(Key=key)
            item = response.get('Item')
            return self._convert_decimals(item) if item else None
        except Exception as e:
            print(f"Error getting item from {table_name}: {e}")
            return None

    def query(self, table_name: str, index_name: Optional[str] = None,
              key_condition: Any = None, filter_expression: Any = None,
              limit: Optional[int] = None, scan_forward: bool = True) -> List[Dict[str, Any]]:
        """
        Query items from table or index

        Args:
            table_name: Name of the table
            index_name: GSI name (optional)
            key_condition: Key condition expression (boto3.dynamodb.conditions.Key)
            filter_expression: Filter expression (boto3.dynamodb.conditions.Attr)
            limit: Max items to return
            scan_forward: Sort order for range key (True=ascending, False=descending)

        Returns:
            List of items
        """
        try:
            table = self.get_table(table_name)

            params = {
                'ScanIndexForward': scan_forward
            }

            if index_name:
                params['IndexName'] = index_name

            if key_condition:
                params['KeyConditionExpression'] = key_condition

            if filter_expression:
                params['FilterExpression'] = filter_expression

            if limit:
                params['Limit'] = limit

            response = table.query(**params)
            items = response.get('Items', [])
            return [self._convert_decimals(item) for item in items]
        except Exception as e:
            print(f"Error querying {table_name}: {e}")
            return []

    def scan(self, table_name: str, filter_expression: Any = None,
             limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Scan entire table (use sparingly, prefer query when possible)

        Args:
            table_name: Name of the table
            filter_expression: Filter expression
            limit: Max items to return

        Returns:
            List of items
        """
        try:
            table = self.get_table(table_name)

            params = {}

            if filter_expression:
                params['FilterExpression'] = filter_expression

            if limit:
                params['Limit'] = limit

            response = table.scan(**params)
            items = response.get('Items', [])
            return [self._convert_decimals(item) for item in items]
        except Exception as e:
            print(f"Error scanning {table_name}: {e}")
            return []

    def update_item(self, table_name: str, key: Dict[str, Any],
                   updates: Dict[str, Any]) -> bool:
        """
        Update specific attributes of an item

        Args:
            table_name: Name of the table
            key: Primary key
            updates: Dict of attributes to update (e.g., {'status': 'active'})

        Returns:
            True if successful, False otherwise
        """
        try:
            table = self.get_table(table_name)

            # Build update expression
            update_expression = "SET " + ", ".join([f"#{k} = :{k}" for k in updates.keys()])
            expression_attribute_names = {f"#{k}": k for k in updates.keys()}
            expression_attribute_values = {f":{k}": self._convert_floats(v) for k, v in updates.items()}

            table.update_item(
                Key=key,
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_attribute_names,
                ExpressionAttributeValues=expression_attribute_values
            )
            return True
        except Exception as e:
            print(f"Error updating item in {table_name}: {e}")
            return False

    def delete_item(self, table_name: str, key: Dict[str, Any]) -> bool:
        """
        Delete an item by primary key

        Args:
            table_name: Name of the table
            key: Primary key

        Returns:
            True if successful, False otherwise
        """
        try:
            table = self.get_table(table_name)
            table.delete_item(Key=key)
            return True
        except Exception as e:
            print(f"Error deleting item from {table_name}: {e}")
            return False

    def batch_write(self, table_name: str, items: List[Dict[str, Any]]) -> bool:
        """
        Batch write multiple items (max 25 per batch)

        Args:
            table_name: Name of the table
            items: List of items to write

        Returns:
            True if successful, False otherwise
        """
        try:
            table = self.get_table(table_name)

            # DynamoDB limits batch writes to 25 items
            batch_size = 25
            for i in range(0, len(items), batch_size):
                batch = items[i:i + batch_size]

                with table.batch_writer() as writer:
                    for item in batch:
                        item = self._convert_floats(item)
                        writer.put_item(Item=item)

            return True
        except Exception as e:
            print(f"Error batch writing to {table_name}: {e}")
            return False

    def _convert_floats(self, obj: Any) -> Any:
        """Convert float to Decimal recursively for DynamoDB compatibility"""
        if isinstance(obj, float):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {k: self._convert_floats(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_floats(i) for i in obj]
        return obj

    def _convert_decimals(self, obj: Any) -> Any:
        """Convert Decimal to float/int recursively for JSON compatibility"""
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        elif isinstance(obj, dict):
            return {k: self._convert_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_decimals(i) for i in obj]
        return obj


# Global instance
db_client = DynamoDBClient()

# Convenience functions (use the global instance)
def put_item(table_name: str, item: Dict[str, Any]) -> bool:
    """Insert or update an item"""
    return db_client.put_item(table_name, item)

def get_item(table_name: str, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Get an item by primary key"""
    return db_client.get_item(table_name, key)

def query(table_name: str, **kwargs) -> List[Dict[str, Any]]:
    """Query items from table or index"""
    return db_client.query(table_name, **kwargs)

def update_item(table_name: str, key: Dict[str, Any], updates: Dict[str, Any]) -> bool:
    """Update specific attributes"""
    return db_client.update_item(table_name, key, updates)

def delete_item(table_name: str, key: Dict[str, Any]) -> bool:
    """Delete an item"""
    return db_client.delete_item(table_name, key)

def batch_write(table_name: str, items: List[Dict[str, Any]]) -> bool:
    """Batch write multiple items"""
    return db_client.batch_write(table_name, items)
