"""
S3 file upload utilities for profile pictures and documents
"""

import boto3
import os
import uuid
import base64
import mimetypes
from typing import Optional, Tuple
from botocore.exceptions import ClientError

# S3 Configuration
S3_BUCKET = os.environ.get('S3_BUCKET', 'prompt-images-nerd')
S3_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_PREFIX = 'commercive/'  # Folder prefix in bucket

# Initialize S3 client
s3_client = boto3.client('s3', region_name=S3_REGION)


def upload_file(
    file_content: bytes,
    file_name: str,
    content_type: Optional[str] = None,
    folder: str = 'uploads'
) -> Optional[str]:
    """
    Upload a file to S3

    Args:
        file_content: File content as bytes
        file_name: Original file name
        content_type: MIME type (auto-detected if not provided)
        folder: Folder within bucket (default: 'uploads')

    Returns:
        Public URL of uploaded file if successful, None otherwise
    """
    try:
        # Generate unique file name
        ext = os.path.splitext(file_name)[1]
        unique_name = f"{uuid.uuid4()}{ext}"
        key = f"{S3_PREFIX}{folder}/{unique_name}"

        # Auto-detect content type if not provided
        if not content_type:
            content_type, _ = mimetypes.guess_type(file_name)
            if not content_type:
                content_type = 'application/octet-stream'

        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=file_content,
            ContentType=content_type,
            ACL='public-read'  # Make file publicly accessible
        )

        # Return public URL
        url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"
        return url

    except ClientError as e:
        print(f"Error uploading to S3: {e.response['Error']['Message']}")
        return None
    except Exception as e:
        print(f"Unexpected error uploading to S3: {e}")
        return None


def upload_base64_image(
    base64_data: str,
    file_name: str = "image.jpg",
    folder: str = 'profile-images'
) -> Optional[str]:
    """
    Upload a base64-encoded image to S3

    Args:
        base64_data: Base64-encoded image data (with or without data URI prefix)
        file_name: File name (default: image.jpg)
        folder: Folder within bucket (default: 'profile-images')

    Returns:
        Public URL if successful, None otherwise
    """
    try:
        # Remove data URI prefix if present (data:image/png;base64,...)
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]

        # Decode base64
        file_content = base64.b64decode(base64_data)

        # Detect image type from header bytes
        content_type = detect_image_type(file_content)

        # Update extension based on detected type
        if content_type:
            ext_map = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/webp': '.webp'
            }
            ext = ext_map.get(content_type, os.path.splitext(file_name)[1])
            file_name = os.path.splitext(file_name)[0] + ext

        return upload_file(file_content, file_name, content_type, folder)

    except Exception as e:
        print(f"Error uploading base64 image: {e}")
        return None


def detect_image_type(file_content: bytes) -> Optional[str]:
    """
    Detect image MIME type from file header bytes

    Args:
        file_content: File content bytes

    Returns:
        MIME type string or None
    """
    # Check magic numbers (file signatures)
    if file_content.startswith(b'\xFF\xD8\xFF'):
        return 'image/jpeg'
    elif file_content.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    elif file_content.startswith(b'GIF87a') or file_content.startswith(b'GIF89a'):
        return 'image/gif'
    elif file_content.startswith(b'RIFF') and file_content[8:12] == b'WEBP':
        return 'image/webp'
    return None


def delete_file(file_url: str) -> bool:
    """
    Delete a file from S3 using its public URL

    Args:
        file_url: Public S3 URL

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        # Extract key from URL
        # Format: https://bucket.s3.region.amazonaws.com/key
        if S3_BUCKET not in file_url:
            print(f"URL does not match bucket: {file_url}")
            return False

        parts = file_url.split(f"{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/")
        if len(parts) != 2:
            print(f"Invalid S3 URL format: {file_url}")
            return False

        key = parts[1]

        # Delete object
        s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
        print(f"Deleted file from S3: {key}")
        return True

    except ClientError as e:
        print(f"Error deleting from S3: {e.response['Error']['Message']}")
        return False
    except Exception as e:
        print(f"Unexpected error deleting from S3: {e}")
        return False


def get_presigned_upload_url(
    file_name: str,
    content_type: str,
    folder: str = 'uploads',
    expiration: int = 3600
) -> Optional[Tuple[str, str]]:
    """
    Generate a presigned URL for direct client-side upload

    Args:
        file_name: Original file name
        content_type: MIME type
        folder: Folder within bucket
        expiration: URL expiration time in seconds (default: 1 hour)

    Returns:
        Tuple of (presigned_url, final_public_url) if successful, None otherwise
    """
    try:
        # Generate unique file name
        ext = os.path.splitext(file_name)[1]
        unique_name = f"{uuid.uuid4()}{ext}"
        key = f"{S3_PREFIX}{folder}/{unique_name}"

        # Generate presigned POST URL
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': key,
                'ContentType': content_type,
                'ACL': 'public-read'
            },
            ExpiresIn=expiration,
            HttpMethod='PUT'
        )

        # Final public URL
        public_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"

        return presigned_url, public_url

    except ClientError as e:
        print(f"Error generating presigned URL: {e.response['Error']['Message']}")
        return None
    except Exception as e:
        print(f"Unexpected error generating presigned URL: {e}")
        return None


def validate_image_file(file_content: bytes, max_size_mb: int = 5) -> Tuple[bool, Optional[str]]:
    """
    Validate an image file

    Args:
        file_content: File content bytes
        max_size_mb: Maximum file size in MB

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check file size
    size_mb = len(file_content) / (1024 * 1024)
    if size_mb > max_size_mb:
        return False, f"File size exceeds {max_size_mb}MB limit"

    # Check if valid image
    content_type = detect_image_type(file_content)
    if not content_type:
        return False, "Invalid image file format"

    # Allowed types
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if content_type not in allowed_types:
        return False, f"File type not allowed. Allowed: JPEG, PNG, GIF, WebP"

    return True, None
