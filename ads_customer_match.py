"""
ads_customer_match.py — Google Ads Customer Match Upload (Stage 6b)
Uploads high-scored lead emails (SHA-256 hashed) to a Google Ads user list.
Google then shows display/YouTube ads to those exact people before your cold email arrives.

REQUIREMENTS:
  pip install google-ads
  google-ads.yaml configured with OAuth2 credentials
  Customer Match enabled on your Google Ads account (requires >$50k spend or policy approval)
  Minimum 1,000 emails to activate the audience (build up over time)

DOCS:
  https://developers.google.com/google-ads/api/docs/remarketing/audience-types/customer-match
"""

import hashlib
from config import (
    GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_YAML_PATH,
    GOOGLE_ADS_CUSTOMER_MATCH_LIST,
    HIGH_INTENT_SCORE,
)
from database import get_leads_for_customer_match, save_ads_audience_entry, mark_ads_audience_failed


def normalize_and_hash(email: str) -> str:
    """SHA-256 hash of lowercase stripped email, as required by Google."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


def _get_ads_client():
    """Initialize Google Ads API client from google-ads.yaml."""
    try:
        from google.ads.googleads.client import GoogleAdsClient
        return GoogleAdsClient.load_from_storage(GOOGLE_ADS_YAML_PATH)
    except ImportError:
        raise ImportError("google-ads package not installed. Run: pip install google-ads")
    except Exception as e:
        raise RuntimeError(f"Google Ads client init failed: {e}")


def upload_customer_match_batch(leads: list[dict]) -> tuple[int, int]:
    """
    Uploads a batch of leads to Google Ads Customer Match.
    Returns (uploaded_count, failed_count).
    """
    if not GOOGLE_ADS_CUSTOMER_ID or not GOOGLE_ADS_CUSTOMER_MATCH_LIST:
        print("  Customer Match: GOOGLE_ADS_CUSTOMER_ID or GOOGLE_ADS_CUSTOMER_MATCH_LIST not configured")
        return 0, 0

    if not leads:
        print("  Customer Match: no new leads to upload")
        return 0, 0

    try:
        client = _get_ads_client()
    except Exception as e:
        print(f"  Customer Match: {e}")
        return 0, len(leads)

    customer_id = GOOGLE_ADS_CUSTOMER_ID.replace("-", "")
    user_data_service = client.get_service("OfflineUserDataJobService")
    user_list_resource = GOOGLE_ADS_CUSTOMER_MATCH_LIST

    # Create the offline user data job
    job_service = client.get_service("OfflineUserDataJobService")
    job_op = client.get_type("OfflineUserDataJob")
    job_op.type_ = client.enums.OfflineUserDataJobTypeEnum.CUSTOMER_MATCH_USER_LIST
    job_op.customer_match_user_list_metadata.user_list = user_list_resource

    try:
        create_response = job_service.create_offline_user_data_job(
            customer_id=customer_id,
            job=job_op,
        )
        job_resource = create_response.resource_name
    except Exception as e:
        print(f"  Customer Match: failed to create job: {e}")
        for lead in leads:
            mark_ads_audience_failed(lead["id"])
        return 0, len(leads)

    # Build user data operations
    UserData = client.get_type("UserData")
    UserIdentifier = client.get_type("UserIdentifier")
    AddUserDataOperation = client.get_type("OfflineUserDataJobOperation")

    operations = []
    lead_map = {}  # hash → lead_id for DB logging

    for lead in leads:
        email = lead.get("email", "")
        if not email:
            continue

        hashed = normalize_and_hash(email)
        lead_map[hashed] = lead["id"]

        identifier = UserIdentifier()
        identifier.hashed_email = hashed

        user_data = UserData()
        user_data.user_identifiers.append(identifier)

        op = AddUserDataOperation()
        op.create.CopyFrom(user_data)
        operations.append(op)

    if not operations:
        return 0, 0

    # Add users to the job in batches of 100 (API limit per request)
    batch_size = 100
    uploaded = 0
    failed = 0

    for i in range(0, len(operations), batch_size):
        batch = operations[i:i + batch_size]
        try:
            job_service.add_offline_user_data_job_operations(
                resource_name=job_resource,
                operations=batch,
                enable_partial_failure=True,
            )
            uploaded += len(batch)
        except Exception as e:
            print(f"  Customer Match batch {i // batch_size + 1} failed: {e}")
            failed += len(batch)

    # Run the job
    try:
        job_service.run_offline_user_data_job(resource_name=job_resource)
    except Exception as e:
        print(f"  Customer Match: job run error: {e}")

    # Log to DB
    for hashed, lead_id in lead_map.items():
        save_ads_audience_entry(lead_id, hashed, user_list_resource)

    print(f"  Customer Match: {uploaded} emails uploaded, {failed} failed")
    return uploaded, failed


def run_customer_match_upload(min_score: int = None) -> int:
    """
    Fetches high-scored leads from DB and uploads them to Customer Match.
    Call this after the score step or as a standalone step.
    Returns number of leads uploaded.
    """
    threshold = min_score or HIGH_INTENT_SCORE
    leads = get_leads_for_customer_match(min_score=threshold)

    if not leads:
        print(f"  Customer Match: no new leads with score >= {threshold}")
        return 0

    print(f"  Customer Match: uploading {len(leads)} leads (score >= {threshold})")
    uploaded, _ = upload_customer_match_batch(leads)
    return uploaded
