"""
Seed Admin Lambda Function
Deploy this Lambda temporarily to create the first admin user.
DELETE THIS LAMBDA AFTER USE for security!

Test Event:
{
  "action": "create_admin",
  "email": "ramoncitomeza1989@gmail.com",
  "password": "Admin123!",
  "first_name": "Ramon",
  "last_name": "Admin"
}
"""

import json
import uuid
import bcrypt
import boto3
from datetime import datetime

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table('commercive_users')


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def handler(event, context):
    """
    Lambda handler to create admin user
    """
    print(f"Received event: {json.dumps(event)}")

    action = event.get('action')

    if action != 'create_admin':
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid action. Use action=create_admin'})
        }

    email = event.get('email', 'ramoncitomeza1989@gmail.com')
    password = event.get('password', 'Admin123!')
    first_name = event.get('first_name', 'Admin')
    last_name = event.get('last_name', 'User')
    phone = event.get('phone', '+1234567890')

    # Check if user already exists
    try:
        response = users_table.query(
            IndexName='email-index',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('email').eq(email)
        )

        if response.get('Items'):
            existing = response['Items'][0]

            # Update existing user to admin if not already
            if existing.get('role') != 'admin':
                users_table.update_item(
                    Key={'user_id': existing['user_id']},
                    UpdateExpression='SET #role = :role, is_approved = :approved, #status = :status, updated_at = :updated',
                    ExpressionAttributeNames={
                        '#role': 'role',
                        '#status': 'status'
                    },
                    ExpressionAttributeValues={
                        ':role': 'admin',
                        ':approved': True,
                        ':status': 'active',
                        ':updated': datetime.utcnow().isoformat()
                    }
                )
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'message': 'Existing user updated to admin',
                        'user_id': existing['user_id'],
                        'email': email
                    })
                }
            else:
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'message': 'User is already an admin',
                        'user_id': existing['user_id'],
                        'email': email
                    })
                }

    except Exception as e:
        print(f"Error checking existing user: {e}")

    # Create new admin user
    now = datetime.utcnow().isoformat()
    user_id = str(uuid.uuid4())
    password_hash = hash_password(password)

    admin_user = {
        'user_id': user_id,
        'email': email,
        'password_hash': password_hash,
        'first_name': first_name,
        'last_name': last_name,
        'phone': phone,
        'role': 'admin',
        'is_affiliate': False,
        'is_store_owner': False,
        'is_approved': True,
        'status': 'active',
        'visible_pages': ['dashboard', 'users', 'stores', 'leads', 'payouts', 'affiliates', 'support', 'settings'],
        'profile_image_url': None,
        'payment_method': None,
        'payment_email': None,
        'created_at': now,
        'updated_at': now
    }

    try:
        users_table.put_item(Item=admin_user)

        return {
            'statusCode': 201,
            'body': json.dumps({
                'message': 'Admin user created successfully!',
                'user_id': user_id,
                'email': email,
                'password': password,
                'note': 'CHANGE PASSWORD AFTER FIRST LOGIN! DELETE THIS LAMBDA!'
            })
        }

    except Exception as e:
        print(f"Error creating admin: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


# For local testing
if __name__ == '__main__':
    test_event = {
        'action': 'create_admin',
        'email': 'ramoncitomeza1989@gmail.com',
        'password': 'Admin123!',
        'first_name': 'Ramon',
        'last_name': 'Admin'
    }
    result = handler(test_event, None)
    print(json.dumps(result, indent=2))
