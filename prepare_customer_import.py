"""
prepare_customer_import.py — cleanup for the Customer database files.

Reads (from this folder):
  - Customer database 1.xlsx  (Sheet1)
  - Customer database 2.xlsx  (Sheet1, ورقة1, ورقة2, Sheet2, Sheet4 — all real data sheets)

Builds one clean, de-duplicated CSV (customers_normalized.csv) for  Leads -> Import.

De-dup strategy: by COMMERCIAL REGISTRATION NUMBER (رقم السجل التجاري), the true
company identifier — not by email (which merges different factories that share a
contact address). Contact details are merged across sheets, Arabic company names
are KEPT when there is no English name, and the ورقة2 registry companies are
included (many have no email/phone yet — they import as 'raw').

Run:  python prepare_customer_import.py
"""

import csv, re
from pathlib import Path
import openpyxl

HERE = Path(__file__).parent
OUT = HERE / "customers_normalized.csv"
COLS = ["first_name", "last_name", "company", "title", "domain",
        "email", "phone", "industry", "country", "linkedin_url"]

AR_CITY = {
    "الرياض": "Riyadh", "جدة": "Jeddah", "مكة": "Makkah", "المدينة المنورة": "Medina",
    "المدينة": "Medina", "الدمام": "Dammam", "الخبر": "Khobar", "الظهران": "Dhahran",
    "الجبيل": "Jubail", "الخرج": "Al Kharj", "ينبع": "Yanbu", "الطائف": "Taif",
    "بريدة": "Buraidah", "القصيم": "Qassim", "عنيزة": "Unaizah", "تبوك": "Tabuk",
    "حائل": "Hail", "نجران": "Najran", "جازان": "Jazan", "جيزان": "Jazan",
    "أبها": "Abha", "خميس مشيط": "Khamis Mushait", "الأحساء": "Al Ahsa",
    "الهفوف": "Hofuf", "سكاكا": "Sakaka", "عرعر": "Arar", "الباحة": "Al Bahah",
    "رابغ": "Rabigh", "القطيف": "Qatif", "الرس": "Ar Rass", "عسير": "Asir",
}

def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in ("NULL", "#N/A", "nan", "None", "-") else s

def is_ar(s):
    return any('؀' <= c <= 'ۿ' for c in s)

def city_en(v):
    s = clean(v)
    if not s:
        return ""
    for ar, en in AR_CITY.items():
        if ar in s:
            return en
    return s

_EMAIL_RE = re.compile(r"[\w.\-+']+@[\w.\-]+\.\w+")

def clean_email(v):
    s = clean(v)
    m = _EMAIL_RE.search(s) if s else None
    return m.group(0).lower() if m else ""

def domain_from_email(e):
    e = clean_email(e)
    return e.split("@", 1)[1] if "@" in e and "." in e.split("@", 1)[1] else ""

def split_name(full):
    full = clean(full)
    if not full:
        return "", ""
    p = full.split()
    return (p[0], "") if len(p) == 1 else (p[0], " ".join(p[1:]))

def load(fn, sheet=None):
    wb = openpyxl.load_workbook(HERE / fn, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return [], []
    hdr = [clean(c) for c in rows[0]]
    return hdr, [r for r in rows[1:] if any(c not in (None, "") for c in r)]

# ── merge store keyed by company identity ─────────────────────────────────────
store, order = {}, []
def upsert(key, rec):
    if key not in store:
        store[key] = rec; order.append(key); return
    cur = store[key]
    # upgrade an Arabic/blank name to an English one if we later find it
    if rec["company"] and (not cur["company"] or (is_ar(cur["company"]) and not is_ar(rec["company"]))):
        cur["company"] = rec["company"]
    for f in ("email", "phone", "domain", "industry", "country", "title", "first_name", "last_name"):
        if not cur.get(f) and rec.get(f):
            cur[f] = rec[f]

# ── Customer database 1 ──────────────────────────────────────────────────────
h, d = load("Customer database 1.xlsx"); idx = {x: i for i, x in enumerate(h) if x}
def g(r, k):
    i = idx.get(k, -1); return clean(r[i]) if 0 <= i < len(r) else ""
db1 = 0
for r in d:
    company = g(r, "Customer")
    if not company:
        continue
    fn, ln = split_name(g(r, "Contact person"))
    email = clean_email(g(r, "e-mail")); addr = g(r, "Address")
    country = "Saudi Arabia" if re.search(r"saudi|ksa", addr, re.I) else ""
    for ar, en in AR_CITY.items():
        if en.lower() in addr.lower():
            country = en; break
    key = email or ("db1|" + company.lower() + fn.lower() + ln.lower())
    upsert(key, {"first_name": fn, "last_name": ln, "company": company, "title": g(r, "position"),
                 "domain": domain_from_email(email), "email": email, "phone": g(r, "telephone"),
                 "industry": "", "country": country or addr, "linkedin_url": ""})
    db1 += 1

# ── Customer database 2 — all data sheets, merged by reg-no (fallback name) ───
for sheet in ["Sheet1", "ورقة1", "ورقة2", "Sheet2", "Sheet4"]:
    try:
        h, d = load("Customer database 2.xlsx", sheet)
    except Exception:
        continue
    idx = {x: i for i, x in enumerate(h) if x}
    def g2(r, k):
        i = idx.get(k, -1); return clean(r[i]) if 0 <= i < len(r) else ""
    for r in d:
        reg = g2(r, "رقم السجل التجاري")
        name = g2(r, "Name of factories") or g2(r, "اسم العميل - انجليزي") or g2(r, "العميل") or g2(r, "اسم العميل")
        if not name:
            continue
        email = clean_email(g2(r, "Email")); phone = g2(r, "Mobile") or g2(r, "Phone")
        key = ("reg|" + reg) if reg else ("nm|" + name.lower())
        upsert(key, {"first_name": "", "last_name": "", "company": name, "title": "",
                     "domain": domain_from_email(email), "email": email, "phone": phone,
                     "industry": g2(r, "الأنشطة الصناعية"),
                     "country": city_en(g2(r, "المدينة")) or "Saudi Arabia", "linkedin_url": ""})

uniq = [store[k] for k in order]
with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=COLS); w.writeheader()
    for rec in uniq:
        w.writerow({c: rec.get(c, "") for c in COLS})

we = sum(1 for r in uniq if r["email"]); wp = sum(1 for r in uniq if r["phone"])
ar = sum(1 for r in uniq if is_ar(r["company"]))
print(f"DB1 merged: {db1}")
print(f"TOTAL unique companies: {len(uniq)}")
print(f"  with email: {we} | with phone: {wp} | Arabic-named: {ar} | English-named: {len(uniq) - ar}")
print(f"Wrote {OUT.name}")
