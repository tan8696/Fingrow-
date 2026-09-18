# Deploying FinGrow

Live site: https://sih-project-rosy-delta.vercel.app

Both the frontend and the API deploy to Vercel automatically on every push to
`main`. There is no second service to set up.

---

## How it fits together

- **Frontend** — Vite builds `frontend/` into static files.
- **API** — [`api/index.py`](api/index.py) is a Vercel serverless function
  that loads the FastAPI app from `backend/`. [`vercel.json`](vercel.json)
  rewrites every `/api/*` request to it, and the app sees the original path, so
  its routes match exactly as they do locally.

Because the API is served from the same origin as the site, there is no CORS
to configure and `VITE_API_URL` stays unset.

---

## One-time setup: API keys

Sign-in, sign-up, the dashboard, loans, harvests and sample data all work with
no keys at all. Three features need one:

Vercel dashboard → the `sih-project` project → **Settings → Environment
Variables**, then add:

| Variable | Needed for | Without it |
|---|---|---|
| `GROQ_API_KEY` | Feasibility reports, stress test | Those return a "not configured" error |
| `BHASHINI_API_KEY` | Report translation | Falls back to MyMemory |
| `DATA_GOV_API_KEY` | Live mandi prices | Shows a clearly labelled sample feed |

Copy the values from your local `backend/.env` — never commit that file.

**Then redeploy** (Deployments → the latest one → ⋯ → Redeploy). Functions
read environment variables at start-up, so a running deployment will not see a
key added afterwards.

---

## The one real limitation: data does not persist

Serverless functions have a read-only filesystem except for `/tmp`, so the
SQLite databases live there — and `/tmp` only lasts as long as the function
instance that holds it. **Accounts and data are lost on every redeploy and
whenever the instance goes cold after a period without traffic.** If requests
ever spread across several instances at once, each would also see its own
separate copy.

For a demonstration that is workable, because the app is built to start empty
and has a one-click **Load sample data** button in Settings:

1. Open the site a few minutes before presenting.
2. Create an account.
3. Settings → **Load sample data**.

If you are signed out unexpectedly, the instance was recycled: sign up again
and reload the sample data.

### When you need data to persist

Run the API somewhere with a real disk instead. [`render.yaml`](render.yaml)
sets that up on Render:

1. [render.com](https://render.com) → **New → Blueprint** → pick
   `tan8696/Fingrow-`, and give it the API keys above.
2. Uncomment the `disk` block in `render.yaml` and change the `*_DB_PATH`
   values from `/tmp/fingrow/` to `/var/data/` (Render disks need a paid
   instance, about $7/month).
3. In Vercel, set `VITE_API_URL=https://<your-render-service>.onrender.com/api`
   and redeploy. The frontend then talks to Render instead of its own `/api`.

The longer-term fix is a hosted database rather than SQLite files, which would
let the Vercel functions keep data on their own.

---

## Troubleshooting

The sign-in screen names the cause when something is wrong:

| Message | Meaning |
|---|---|
| `No API found at /api` | The deployment has no API function — check the build log for `api/index.py` |
| `Cannot reach the server at …` | The network request never completed |
| `The server is not responding` | The function failed to start — check Vercel's runtime logs |

---

## Running locally

Two terminals:

```bash
cd backend && python -m uvicorn app.main:app --reload
```

```bash
cd frontend && npm run dev
```

Vite proxies `/api` to port 8000, so requests stay same-origin locally too.
Local data is kept in `backend/*.db` and does persist.
