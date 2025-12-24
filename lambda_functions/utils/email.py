"""
Email sending utilities using AWS SES
"""

import boto3
import os
from typing import List, Optional
from botocore.exceptions import ClientError

# AWS SES Configuration
SES_REGION = os.environ.get('AWS_REGION', 'us-east-1')
FROM_EMAIL = os.environ.get('SES_FROM_EMAIL', 'ramoncitomeza1989@gmail.com')
FROM_NAME = os.environ.get('SES_FROM_NAME', 'Commercive')

# Initialize SES client
ses_client = boto3.client('ses', region_name=SES_REGION)


def send_email(
    to_email: str | List[str],
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    cc_emails: Optional[List[str]] = None,
    bcc_emails: Optional[List[str]] = None
) -> bool:
    """
    Send an email using AWS SES

    Args:
        to_email: Recipient email(s) - string or list
        subject: Email subject
        html_body: HTML email body
        text_body: Plain text email body (optional, defaults to stripped HTML)
        cc_emails: CC recipients (optional)
        bcc_emails: BCC recipients (optional)

    Returns:
        True if sent successfully, False otherwise
    """
    try:
        # Normalize to_email to list
        if isinstance(to_email, str):
            to_email = [to_email]

        # Build destination
        destination = {'ToAddresses': to_email}

        if cc_emails:
            destination['CcAddresses'] = cc_emails

        if bcc_emails:
            destination['BccAddresses'] = bcc_emails

        # Build message body
        body = {'Html': {'Data': html_body, 'Charset': 'UTF-8'}}

        if text_body:
            body['Text'] = {'Data': text_body, 'Charset': 'UTF-8'}

        # Send email
        response = ses_client.send_email(
            Source=f'{FROM_NAME} <{FROM_EMAIL}>',
            Destination=destination,
            Message={
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': body
            }
        )

        print(f"Email sent successfully. Message ID: {response['MessageId']}")
        return True

    except ClientError as e:
        print(f"Error sending email: {e.response['Error']['Message']}")
        return False
    except Exception as e:
        print(f"Unexpected error sending email: {e}")
        return False


def send_verification_email(to_email: str, verification_code: str, user_name: str = "User") -> bool:
    """
    Send email verification code

    Args:
        to_email: Recipient email
        verification_code: 6-digit verification code
        user_name: User's name

    Returns:
        True if sent successfully
    """
    subject = "Verify your Commercive account"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            .logo {{ font-size: 32px; font-weight: 700; color: #8e52f2; }}
            .code-box {{
                background: linear-gradient(135deg, #5B21B6 0%, #8e52f2 100%);
                color: white;
                font-size: 36px;
                font-weight: 700;
                text-align: center;
                padding: 30px;
                border-radius: 12px;
                letter-spacing: 8px;
                margin: 30px 0;
            }}
            .content {{ color: #1B1F3B; line-height: 1.6; }}
            .footer {{ margin-top: 40px; color: #6B7280; font-size: 14px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">COMMERCIVE</div>
            </div>
            <div class="content">
                <h2>Welcome, {user_name}!</h2>
                <p>Thank you for signing up for Commercive. To complete your registration, please verify your email address using the code below:</p>

                <div class="code-box">{verification_code}</div>

                <p>This code will expire in 15 minutes.</p>

                <p>If you didn't create a Commercive account, you can safely ignore this email.</p>
            </div>
            <div class="footer">
                <p>&copy; 2025 Commercive. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html_body)


def send_password_reset_email(to_email: str, reset_token: str, user_name: str = "User") -> bool:
    """
    Send password reset email

    Args:
        to_email: Recipient email
        reset_token: Password reset token (UUID)
        user_name: User's name

    Returns:
        True if sent successfully
    """
    # TODO: Update with actual frontend URL from env var
    reset_url = f"https://dashboard.commercive.co/reset-password?token={reset_token}"

    subject = "Reset your Commercive password"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            .logo {{ font-size: 32px; font-weight: 700; color: #8e52f2; }}
            .button {{
                display: inline-block;
                background: linear-gradient(135deg, #5B21B6 0%, #8e52f2 100%);
                color: white;
                padding: 16px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 20px 0;
            }}
            .content {{ color: #1B1F3B; line-height: 1.6; }}
            .footer {{ margin-top: 40px; color: #6B7280; font-size: 14px; text-align: center; }}
            .warning {{ background: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">COMMERCIVE</div>
            </div>
            <div class="content">
                <h2>Password Reset Request</h2>
                <p>Hi {user_name},</p>
                <p>We received a request to reset your password. Click the button below to create a new password:</p>

                <div style="text-align: center;">
                    <a href="{reset_url}" class="button">Reset Password</a>
                </div>

                <p>This link will expire in 1 hour.</p>

                <div class="warning">
                    <strong>Security Note:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                </div>
            </div>
            <div class="footer">
                <p>&copy; 2025 Commercive. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html_body)


def send_welcome_email(to_email: str, user_name: str) -> bool:
    """
    Send welcome email after account approval

    Args:
        to_email: Recipient email
        user_name: User's name

    Returns:
        True if sent successfully
    """
    dashboard_url = os.environ.get('DASHBOARD_URL', 'https://dashboard.commercive.co')

    subject = "Welcome to Commercive - Your account is approved!"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            .logo {{ font-size: 32px; font-weight: 700; color: #8e52f2; }}
            .button {{
                display: inline-block;
                background: linear-gradient(135deg, #5B21B6 0%, #8e52f2 100%);
                color: white;
                padding: 16px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 20px 0;
            }}
            .content {{ color: #1B1F3B; line-height: 1.6; }}
            .footer {{ margin-top: 40px; color: #6B7280; font-size: 14px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">COMMERCIVE</div>
            </div>
            <div class="content">
                <h2>Welcome to Commercive!</h2>
                <p>Hi {user_name},</p>
                <p>Great news! Your Commercive account has been approved. You now have full access to our platform.</p>

                <div style="text-align: center;">
                    <a href="{dashboard_url}" class="button">Access Dashboard</a>
                </div>

                <p>Here's what you can do:</p>
                <ul>
                    <li>Connect your Shopify store</li>
                    <li>Manage inventory and orders</li>
                    <li>Track shipments in real-time</li>
                    <li>Access our affiliate program</li>
                </ul>

                <p>If you have any questions, our support team is here to help!</p>
            </div>
            <div class="footer">
                <p>&copy; 2025 Commercive. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html_body)


def send_affiliate_invitation_email(to_email: str, affiliate_name: str, invited_by: str) -> bool:
    """
    Send affiliate program invitation email

    Args:
        to_email: Recipient email
        affiliate_name: Affiliate's name
        invited_by: Name of person who sent invitation

    Returns:
        True if sent successfully
    """
    signup_url = os.environ.get('DASHBOARD_URL', 'https://dashboard.commercive.co') + '/signup?affiliate=true'

    subject = f"{invited_by} invited you to join Commercive Partners"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            .logo {{ font-size: 32px; font-weight: 700; color: #8e52f2; }}
            .button {{
                display: inline-block;
                background: linear-gradient(135deg, #5B21B6 0%, #8e52f2 100%);
                color: white;
                padding: 16px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 20px 0;
            }}
            .content {{ color: #1B1F3B; line-height: 1.6; }}
            .footer {{ margin-top: 40px; color: #6B7280; font-size: 14px; text-align: center; }}
            .benefits {{ background: #F4F5F7; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">COMMERCIVE</div>
            </div>
            <div class="content">
                <h2>You're Invited to Commercive Partners!</h2>
                <p>Hi {affiliate_name},</p>
                <p>{invited_by} thinks you'd be a great fit for the Commercive Partner Program!</p>

                <div class="benefits">
                    <h3>Partner Benefits:</h3>
                    <ul>
                        <li>Earn commissions on every qualified lead</li>
                        <li>Access to marketing materials and resources</li>
                        <li>Real-time performance tracking</li>
                        <li>Fast and reliable payouts</li>
                    </ul>
                </div>

                <div style="text-align: center;">
                    <a href="{signup_url}" class="button">Join Now</a>
                </div>

                <p>Ready to start earning? Sign up today!</p>
            </div>
            <div class="footer">
                <p>&copy; 2025 Commercive. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html_body)


def send_admin_invitation_email(to_email: str, invited_by_name: str, invitation_token: str) -> bool:
    """
    Send admin user invitation email

    Args:
        to_email: Recipient email
        invited_by_name: Name of admin who sent invitation
        invitation_token: Invitation token

    Returns:
        True if sent successfully
    """
    signup_url = f"{os.environ.get('ADMIN_DASHBOARD_URL', 'https://admin.commercive.co')}/signup?token={invitation_token}"

    subject = f"{invited_by_name} invited you to join Commercive Admin"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
            .header {{ text-align: center; margin-bottom: 40px; }}
            .logo {{ font-size: 32px; font-weight: 700; color: #8e52f2; }}
            .button {{
                display: inline-block;
                background: linear-gradient(135deg, #5B21B6 0%, #8e52f2 100%);
                color: white;
                padding: 16px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 20px 0;
            }}
            .content {{ color: #1B1F3B; line-height: 1.6; }}
            .footer {{ margin-top: 40px; color: #6B7280; font-size: 14px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">COMMERCIVE</div>
            </div>
            <div class="content">
                <h2>Admin Invitation</h2>
                <p>Hi,</p>
                <p>{invited_by_name} has invited you to join the Commercive admin team.</p>

                <div style="text-align: center;">
                    <a href="{signup_url}" class="button">Accept Invitation</a>
                </div>

                <p>This invitation will expire in 48 hours.</p>

                <p>If you believe this invitation was sent in error, please contact our team.</p>
            </div>
            <div class="footer">
                <p>&copy; 2025 Commercive. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html_body)
