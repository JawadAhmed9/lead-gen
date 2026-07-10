# Deploying Lead Gen AI (free, on Render)

This ships the whole app as **one free Render web service** — FastAPI serves both
the API and the built React UI from a single URL, using a Docker image.

## What you get

- A public HTTPS URL your team can log into and test.
- The image includes your real `data/leads.db`, so testers start from your
  ~913 leads + the seeded demo users every time.
- Cost: **$0** (Render free web service).

## ⚠️ Two things to know about the free tier

1. **Ephemeral data.** The free filesystem resets when the service **sleeps
   (after 15 min idle)** or **redeploys**. Anything created during testing —
   new users, lead assignments, logged calls, deals, the leaderboard — is wiped
   back to the baseline (your leads + demo users). Great for repeatable demos;
   not for accumulating data over days. (To keep data: upgrade to a paid disk,
   or move to Postgres — ask and I'll set it up.)
2. **Cold start.** After idling, the first request takes ~1 minute to wake.

## Prerequisites

- A **GitHub account** and a **Render account** (sign up free at render.com).
- Git installed locally.

## Step 1 — Push the project to a PRIVATE GitHub repo

> 🔒 **Make the repo private.** `data/leads.db` contains real contact data
> (names, emails, phones). Do not push it to a public repo. `.env` is already
> gitignored so your API keys are NOT committed.

```bash
cd path/to/Lead_Gen-AI
git init
git add .
git commit -m "Lead Gen AI"
# create a PRIVATE repo on github.com, then:
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

## Step 2 — Deploy on Render (Blueprint)

1. Render Dashboard → **New → Blueprint**.
2. Connect your GitHub and pick the repo. Render reads `render.yaml` and creates
   the Docker web service on the **free** plan automatically.
3. When prompted, fill in the environment variables (these are your keys — they
   live only in Render, never in git):
   - `APOLLO_API_KEY`
   - `GROQ_API_KEY`
   - *(optional, only to turn on email later)* `BREVO_API_KEY`,
     `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
4. Click **Apply**. Render builds the Docker image (installs Python deps, builds
   the React app) and deploys. First build takes a few minutes.

*(No `render.yaml`? Use New → Web Service → connect repo → Runtime: Docker →
Instance type: Free, and add the env vars manually.)*

## Step 3 — Share the URL

Render gives you `https://lead-gen-ai-xxxx.onrender.com`. These accounts are
seeded in `sales.py`, so they persist across the free tier's resets.

**Your team (full admin access):**

| Name | Email | Password |
|---|---|---|
| Jawad Ahmed Khan | jawad@stemronic.com | stemronic432 |
| Muhammad Asad Khan | khan@stemronic.com | stemronic432 |
| Mohsin Rafiq | mohsin@stemronic.com | stemronic432 |

**Demo accounts (to test the manager / agent / viewer experience):**

| Role | Email | Password |
|---|---|---|
| Manager | manager@company.com | manager123 |
| Agent | agent@company.com | agent123 |
| Agent | agent2@company.com | agent123 |
| Viewer | viewer@company.com | viewer123 |

> To change logins later, edit `SEED_USERS` at the top of `sales.py` and redeploy.

## Updating the app

Push to `main` and Render auto-redeploys:
```bash
git add -A && git commit -m "update" && git push
```

## Notes specific to this app

- **Email (Brevo)** uses Brevo's HTTPS API, so it works on Render (Render blocks
  only SMTP ports, not HTTPS). It stays inactive until you set the Brevo env vars.
- **Apollo collection** makes external API calls. Light manual runs are fine;
  Render may throttle a free service that generates very high external traffic,
  so avoid large back-to-back collection runs on the free tier.
- **Sessions** are in-memory, so a redeploy/sleep logs everyone out (they just
  log back in). Fine for testing.
- The UI loads Tailwind from its CDN at runtime; you may see a console note that
  the CDN build isn't for production — harmless for testing.
