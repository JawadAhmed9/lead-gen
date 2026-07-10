"""
excel_importer.py — Import leads from Excel (.xlsx) or CSV
Fixed column format — column ORDER doesn't matter, headers are case-insensitive.

REQUIRED columns:  first_name, last_name, company
OPTIONAL columns:  title, domain, email, industry, country, employee_count, linkedin_url

Key behaviour:
  - Row has email  → saved with status='enriched'  (Hunter step is skipped)
  - Row has no email → saved with status='raw'      (Hunter will find email later)
  - Duplicate rows (same first+last+company) are skipped automatically by the DB
  - intent_level defaults to 'medium' for all imported leads

Install for XLSX support:  pip install openpyxl
CSV files need no extra packages.
"""

import csv, uuid, json
from pathlib import Path
from datetime import datetime
from io import StringIO

# ─── Column definitions ───────────────────────────────────────────────────────

REQUIRED_COLS  = {"company"}   # first_name/last_name can be blank for company-only rows

ALL_COLS = [
    "first_name", "last_name", "company", "title",
    "domain", "email", "industry", "country",
    "employee_count", "linkedin_url",
]

TEMPLATE_ROW = {
    "first_name":    "Jane",
    "last_name":     "Smith",
    "company":       "Acme Manufacturing",
    "title":         "Operations Manager",
    "domain":        "acme.com",
    "email":         "jane.smith@acme.com",
    "industry":      "manufacturing",
    "country":       "US",
    "employee_count": "250",
    "linkedin_url":  "https://linkedin.com/in/janesmith",
}


def get_template_csv() -> str:
    """Returns a template CSV string with headers + one example row."""
    out = StringIO()
    w = csv.DictWriter(out, fieldnames=ALL_COLS)
    w.writeheader()
    w.writerow(TEMPLATE_ROW)
    return out.getvalue()


# ─── Row normaliser ───────────────────────────────────────────────────────────

def _normalise(row: dict) -> dict | None:
    """
    Takes a raw row dict (keys already lowercased), validates required fields,
    and returns a normalised lead dict ready for save_raw_lead().
    Returns None if required fields are missing.
    """
    # Strip whitespace from all values
    row = {k: str(v).strip() if v is not None else "" for k, v in row.items()}

    # Validate required
    for col in REQUIRED_COLS:
        if not row.get(col):
            return None

    email = row.get("email", "")
    has_email = bool(email and "@" in email)

    try:
        emp = int(row.get("employee_count", "") or 0)
    except ValueError:
        emp = None

    # phone can come from multiple header aliases (all mapped to "phone" above)
    phone = row.get("phone", "")

    lead = {
        "id":            str(uuid.uuid4()),
        "source":        "excel_import",
        "first_name":    row.get("first_name", ""),
        "last_name":     row.get("last_name", ""),
        "company":       row.get("company", ""),
        "title":         row.get("title", ""),
        "domain":        row.get("domain", ""),
        "email":         email,          # stored in raw_json for enricher step
        "phone":         phone,
        "industry":      row.get("industry", ""),
        "country":       row.get("country", ""),
        "employee_count": emp,
        "linkedin_url":  row.get("linkedin_url", ""),
        "intent_level":  "medium",       # default for manually imported leads
        "pain_point":    "",
        "contact_hook":  "",
        "_has_email":    has_email,      # internal flag — stripped before DB save
    }
    return lead


# ─── Importers ────────────────────────────────────────────────────────────────

def _process_rows(rows: list[dict]) -> dict:
    """
    Takes a list of raw row dicts, normalises them, saves to DB.
    Returns summary: {imported, skipped, errors}
    """
    from database import save_raw_lead, save_enriched

    imported = skipped = 0
    errors: list[str] = []

    for i, raw in enumerate(rows, start=2):   # start=2 → row 1 is headers
        # Lowercase all keys and normalise spaces→underscores for case-insensitive matching
        # e.g. "First Name" → "first_name", "E-mail Address" → "e-mail_address" → mapped below
        row = {k.lower().strip().replace(" ", "_").replace("-", "_"): v for k, v in raw.items()}
        # Alias common header variants to the canonical field names
        ALIASES = {
            "e_mail": "email", "e_mail_address": "email", "mail": "email",
            "first": "first_name", "fname": "first_name",
            "last": "last_name",  "lname": "last_name", "surname": "last_name",
            "organisation": "company", "organization": "company", "name": "company",
            "designation": "title", "position": "title", "role": "title",
            "website": "domain", "web": "domain", "url": "domain",
            "mobile": "phone", "telephone": "phone", "mob": "phone", "tel": "phone",
            "employees": "employee_count", "headcount": "employee_count",
            "linkedin": "linkedin_url", "loc": "country", "location": "country", "city": "country",
        }
        row = {ALIASES.get(k, k): v for k, v in row.items()}

        lead = _normalise(row)
        if lead is None:
            skipped += 1
            errors.append(f"Row {i}: missing required field (first_name / last_name / company)")
            continue

        has_email = lead.pop("_has_email")
        email     = lead.pop("email")   # remove from raw lead dict before DB save

        try:
            save_raw_lead(lead)

            if has_email:
                # Write to enriched_leads so this lead skips Hunter
                save_enriched(lead["id"], {
                    "email":          email,
                    "email_verified": True,     # user-supplied, treat as trusted
                    "company_size":   lead.get("employee_count"),
                    "industry":       lead.get("industry"),
                    "tech_stack":     [],
                })

            imported += 1

        except Exception as e:
            skipped += 1
            errors.append(f"Row {i}: DB error — {e}")

    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}


def import_csv(path: str | Path) -> dict:
    """Import from a .csv file."""
    path = Path(path)
    rows = []
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    except UnicodeDecodeError:
        with open(path, newline="", encoding="latin-1") as f:
            rows = list(csv.DictReader(f))
    return _process_rows(rows)


def import_xlsx(path: str | Path) -> dict:
    """Import from a .xlsx file. Requires: pip install openpyxl"""
    try:
        import openpyxl
    except ImportError:
        return {
            "imported": 0, "skipped": 0,
            "errors": ["openpyxl not installed — run: pip install openpyxl\n"
                       "Or use CSV format instead (.csv files work without extra packages)."]
        }

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active

    headers = None
    rows = []
    for row in ws.iter_rows(values_only=True):
        if headers is None:
            headers = [str(c).strip() if c else "" for c in row]
            continue
        row_dict = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
        rows.append(row_dict)

    wb.close()
    return _process_rows(rows)


def import_file(path: str | Path) -> dict:
    """Auto-detect format (.csv or .xlsx) and import."""
    path = Path(path)
    if path.suffix.lower() == ".xlsx":
        return import_xlsx(path)
    elif path.suffix.lower() in (".csv", ".txt"):
        return import_csv(path)
    else:
        return {
            "imported": 0, "skipped": 0,
            "errors": [f"Unsupported file type '{path.suffix}'. Use .xlsx or .csv"]
        }
