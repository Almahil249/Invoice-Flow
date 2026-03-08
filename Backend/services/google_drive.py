"""Google Drive integration service using OAuth 2.0 credentials and REST API."""

from __future__ import annotations
import logging
import os
import json
from io import BytesIO
from pathlib import Path
import httpx

# keep google-auth imports for credential management
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from config import settings

logger = logging.getLogger(__name__)

DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/cloud-vision"
]

# Token file lives next to this module's parent (server/)
_SERVER_DIR = Path(__file__).resolve().parent.parent
_TOKEN_FILE = _SERVER_DIR / "token.json"

DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"


def _build_client_config() -> dict:
    """Build the OAuth client config dict from environment variables."""
    return {
        "installed": {
            "client_id": settings.client_id,
            "project_id": settings.project_id,
            "auth_uri": settings.auth_uri,
            "token_uri": settings.token_uri,
            "auth_provider_x509_cert_url": settings.auth_provider_x509_cert_url,
            "client_secret": settings.client_secret,
            "redirect_uris": [uri.strip() for uri in settings.redirect_uris.split(",")],
        }
    }


def get_credentials() -> Credentials:
    """Load or create OAuth 2.0 credentials.
    
    Prioritises GOOGLE_TOKEN_JSON env var for non-interactive environments (Vercel).
    Falls back to local token.json file for development.
    """
    creds: Credentials | None = None

    # 1. Try loading from environment variable (for Vercel/Production)
    if settings.google_token_json:
        try:
            token_info = json.loads(settings.google_token_json)
            creds = Credentials.from_authorized_user_info(token_info, DRIVE_SCOPES)
            logger.info("Loaded OAuth credentials from GOOGLE_TOKEN_JSON env var")
        except json.JSONDecodeError:
            logger.error("Failed to parse GOOGLE_TOKEN_JSON env var")
        except Exception as e:
            logger.error(f"Error loading credentials from env var: {e}")

    # 2. If no env var creds, try loading local file
    if not creds and _TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(_TOKEN_FILE), DRIVE_SCOPES)
        except Exception as e:
            logger.warning(f"Failed to load local token file: {e}")

    # 3. If no valid creds, refresh or run the auth flow (Local Dev only)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                logger.info("Refreshing expired OAuth token...")
                creds.refresh(Request())
            except Exception as e:
                logger.error(f"Token refresh failed: {e}")
                creds = None
        
        # Only launch browser if we haven't found a valid token in env or file
        if not creds:
            if not settings.client_id or not settings.client_secret:
                raise ValueError(
                    "OAuth credentials not configured. "
                    "Set client_id and client_secret in your .env file."
                )
            
            # CRITICAL: Do not launch browser in production/headless environments
            if os.environ.get("VERCEL") or os.environ.get("CI"):
                 raise RuntimeError(
                     "No valid Google OAuth token found in GOOGLE_TOKEN_JSON or token.json. "
                     "Interactive login is not possible in this environment."
                 )

            logger.info("No valid token found — launching OAuth consent flow in browser...")
            client_config = _build_client_config()
            flow = InstalledAppFlow.from_client_config(client_config, DRIVE_SCOPES)
            creds = flow.run_local_server(port=0)

        # 4. Save the token for next startup (only if we're using file storage)
        if creds and not settings.google_token_json:
            try:
                with open(_TOKEN_FILE, "w") as f:
                    f.write(creds.to_json())
                logger.info("OAuth token saved to %s", _TOKEN_FILE)
            except Exception as e:
                 logger.warning(f"Could not save token to file: {e}")

    return creds


def _get_access_token() -> str | None:
    """Get a fresh access token."""
    creds = get_credentials()
    if creds:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        return creds.token
    return None


def _get_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }


def _get_or_create_folder(token: str, name: str, parent_id: str) -> str:
    """Get an existing folder by name under a parent, or create it using REST ID."""
    query = (
        f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' "
        f"and '{parent_id}' in parents and trashed = false"
    )
    
    headers = _get_headers(token)
    params = {
        "q": query,
        "spaces": "drive",
        "fields": "files(id)"
    }
    
    with httpx.Client() as client:
        resp = client.get(DRIVE_API_URL, headers=headers, params=params)
        resp.raise_for_status()
        files = resp.json().get("files", [])
        
        if files:
            return files[0]["id"]
            
        # Create folder
        metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]
        }
        
        create_resp = client.post(
            DRIVE_API_URL, 
            headers=headers, 
            json=metadata,
            params={"fields": "id"}
        )
        create_resp.raise_for_status()
        return create_resp.json()["id"]


def _resolve_upload_folder(token: str, team: str, member: str, subfolder: str = "original") -> str:
    """
    Resolve (create if needed) the folder path:
      /Invoice_System/{team}/{member}/{subfolder}/
    Returns the folder ID.
    """
    root_id = settings.google_drive_folder_id
    team_id = _get_or_create_folder(token, team, root_id)
    member_id = _get_or_create_folder(token, member, team_id)
    sub_id = _get_or_create_folder(token, subfolder, member_id)
    return sub_id


def upload_image(
    image_bytes: bytes,
    team: str,
    member: str,
    file_name: str,
    mimetype: str = "image/jpeg",
    subfolder: str = "original",
) -> dict:
    """
    Upload an image to Google Drive directly from memory using REST API (multipart).
    """
    token = _get_access_token()
    if not token:
        raise RuntimeError("Failed to obtain Google Drive access token")

    folder_id = _resolve_upload_folder(token, team, member, subfolder)
    
    # Multipart upload construction
    metadata = {
        "name": file_name,
        "parents": [folder_id]
    }
    
    boundary = "foo_bar_baz"
    body_payload = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mimetype}\r\n\r\n"
    ).encode("utf-8") + image_bytes + (
        f"\r\n--{boundary}--"
    ).encode("utf-8")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/related; boundary={boundary}"
    }

    params = {
        "uploadType": "multipart",
        "fields": "id,webViewLink,webContentLink"
    }

    with httpx.Client() as client:
        resp = client.post(
            UPLOAD_URL,
            content=body_payload,
            headers=headers,
            params=params,
            timeout=60.0
        )
        # Check for errors
        if resp.status_code >= 400:
             logger.error(f"Drive upload failed: {resp.text}")
             resp.raise_for_status()
             
        uploaded = resp.json()
        file_id = uploaded.get("id")

        # Set permissions ("anyone" reader)
        perm_url = f"{DRIVE_API_URL}/{file_id}/permissions"
        client.post(
            perm_url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"type": "anyone", "role": "reader"}
        )

        logger.info("Uploaded '%s' to Drive (id=%s)", file_name, file_id)

        return {
            "id": file_id,
            "webViewLink": uploaded.get("webViewLink", ""),
            "webContentLink": uploaded.get("webContentLink", ""),
        }


def download_file(file_id: str) -> bytes:
    """Download a file from Google Drive by ID, returning raw bytes."""
    token = _get_access_token()
    headers = _get_headers(token) if token else {}
    
    url = f"{DRIVE_API_URL}/{file_id}"
    params = {"alt": "media"}
    
    with httpx.Client() as client:
        resp = client.get(url, headers=headers, params=params, timeout=60.0)
        resp.raise_for_status()
        return resp.content


def list_team_folders() -> list[str]:
    """List team folder names under the root Invoice_System folder."""
    token = _get_access_token()
    if not token:
        return []

    root_id = settings.google_drive_folder_id
    if not root_id:
        return []

    query = (
        f"'{root_id}' in parents "
        f"and mimeType = 'application/vnd.google-apps.folder' "
        f"and trashed = false"
    )
    
    headers = _get_headers(token)
    params = {
        "q": query,
        "spaces": "drive",
        "fields": "files(name)"
    }
    
    with httpx.Client() as client:
        resp = client.get(DRIVE_API_URL, headers=headers, params=params)
        if resp.status_code != 200:
            logger.error("Failed to list team folders: %s", resp.text)
            return []
            
        data = resp.json()
        return [f["name"] for f in data.get("files", [])]


def delete_file(file_id: str) -> bool:
    """Delete a file from Google Drive (move to trash avoids permanent deletion immediately, or use delete for permanent)."""
    token = _get_access_token()
    if not token:
        logger.error("Failed to get token for file deletion")
        return False

    headers = _get_headers(token)
    
    # Use DELETE method to permanently delete, or PATCH with trashed=true to trash.
    # Usually "delete" implies recycle bin in Drive, but API "delete" is permanent.
    # Let's use "delete" method as per plan, but we can also check if we want to just trash it.
    # Plan said "DELETE https://www.googleapis.com/drive/v3/files/{file_id}". That is permanent.
    
    url = f"{DRIVE_API_URL}/{file_id}"
    
    with httpx.Client() as client:
        resp = client.delete(url, headers=headers, timeout=10.0)
        
        if resp.status_code == 204:
            logger.info(f"Deleted file {file_id} from Drive")
            return True
        elif resp.status_code == 404:
            logger.warning(f"File {file_id} not found in Drive (already deleted?)")
            return True
        else:
            logger.error(f"Failed to delete file {file_id}: {resp.text}")
            return False
