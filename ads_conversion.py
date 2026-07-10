"""
ads_conversion.py — Google Ads Offline Conversion Upload
Sends a conversion event back to Google Ads when a lead that arrived via
Google Ads (has a gclid) replies "interested" or books a call.

This closes the loop: Google's algorithm learns which keywords and audiences
produce real outcomes and adjusts bids automatically.

REQUIREMENTS:
  pip install google-ads
  google-ads.yaml configured with OAuth2 credentials
  Conversion action created in Google Ads → Goals → Conversions

DOCS:
  https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
"""

from datetime import datetime, timezone
from config import (
    GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_YAML_PATH,
    GOOGLE_ADS_CONVERSION_ACTION,
)


def _get_ads_client():
    try:
        from google.ads.googleads.client import GoogleAdsClient
        return GoogleAdsClient.load_from_storage(GOOGLE_ADS_YAML_PATH)
    except ImportError:
        raise ImportError("google-ads package not installed. Run: pip install google-ads")
    except Exception as e:
        raise RuntimeError(f"Google Ads client init failed: {e}")


def upload_conversion(
    gclid: str,
    conversion_value: float = 0.0,
    currency_code: str = "USD",
    conversion_time: datetime = None,
) -> bool:
    """
    Uploads a single offline click conversion to Google Ads.

    Args:
        gclid: Google Click ID stored on the lead at inbound form submission time
        conversion_value: monetary value of the conversion (0 = just signal, no revenue yet)
        currency_code: ISO 4217 currency code
        conversion_time: when the conversion happened (defaults to now)

    Returns True on success, False on failure.
    """
    if not GOOGLE_ADS_CUSTOMER_ID or not GOOGLE_ADS_CONVERSION_ACTION:
        print("  Ads conversion: GOOGLE_ADS_CUSTOMER_ID or GOOGLE_ADS_CONVERSION_ACTION not configured")
        return False

    if not gclid:
        return False

    try:
        client = _get_ads_client()
    except Exception as e:
        print(f"  Ads conversion: {e}")
        return False

    customer_id = GOOGLE_ADS_CUSTOMER_ID.replace("-", "")
    conversion_upload_service = client.get_service("ConversionUploadService")

    # Google requires format: "yyyy-mm-dd hh:mm:ss+00:00"
    if conversion_time is None:
        conversion_time = datetime.now(timezone.utc)
    formatted_time = conversion_time.strftime("%Y-%m-%d %H:%M:%S+00:00")

    click_conversion = client.get_type("ClickConversion")
    click_conversion.gclid = gclid
    click_conversion.conversion_action = GOOGLE_ADS_CONVERSION_ACTION
    click_conversion.conversion_date_time = formatted_time
    click_conversion.conversion_value = conversion_value
    click_conversion.currency_code = currency_code

    try:
        response = conversion_upload_service.upload_click_conversions(
            customer_id=customer_id,
            conversions=[click_conversion],
            partial_failure=True,
        )

        if response.partial_failure_error:
            print(f"  Ads conversion partial failure: {response.partial_failure_error}")
            return False

        result = response.results[0]
        print(f"  Ads conversion uploaded: gclid={gclid[:12]}... action={result.conversion_action}")
        return True

    except Exception as e:
        print(f"  Ads conversion upload failed: {e}")
        return False


def upload_call_booked_conversion(gclid: str, deal_value: float = 0.0) -> bool:
    """
    Convenience wrapper for when a lead books a discovery call.
    Use a separate, higher-value conversion action for call bookings.
    """
    return upload_conversion(gclid, conversion_value=deal_value)
