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

## Optional setup: environment variables

The live site works with **no configuration at all**: sign-up, sign-in,
onboarding, sample data, feasibility reports, the stress test, verification and
PDFs. Setting these improves it:

Vercel dashboard → the `sih-project` project → **Settings → Environment
Variables**:

| Variable | What it adds |
|---|---|
| `SESSION_SECRET` | A private signing key for session tokens. Without it the key is derived from deployment values, some of which are public for a public repository — fine for a demo, not for real users. Any long random string. |
| `GROQ_API_KEY` | Model-written report narratives. Without it — or if Groq refuses the network — reports use a narrative built by rules from the same measured figures, and the decision receipt says so. |
| `BHASHINI_API_KEY` | Report translation through Bhashini. Falls back to MyMemory. |
| `DATA_GOV_API_KEY` | Live AGMARKNET mandi prices. Falls back to a clearly labelled sample feed. |

Copy the values from your local `backend/.env` — never commit that file — then
**redeploy**, since functions only read environment variables at start-up.

---

## How data behaves on the live site

Serverless functions have a read-only filesystem except for `/tmp`, so the
SQLite databases live there, and `/tmp` only lasts as long as the function
instance that holds it. Vercel retires instances on its own schedule — tested
on 18 Sept 2026, one account was gone after about three minutes.

What that no longer breaks:

- **Staying signed in.** Session tokens are signed and carry the account's
  identity and profile, so any instance can verify one without a lookup.
- **Onboarding.** The profile rides in the token, so a fresh instance knows
  onboarding is done.
- **Sample data.** A fresh instance rebuilds it from a flag in the token, since
  seeded data is deterministic.
- **Reports.** The report is returned in full when it is generated.

What still depends on the instance, and needs a shared database to fix:

- **Signing in again after signing out.** Signing in checks the password
  against a stored hash; an instance that never saw the account does not have
  one. Stay signed in during a demo.
- **Records you create yourself** — a logged harvest, an applied-for loan, a
  saved report's verify/PDF/stress-test link — live on the instance that
  created them.

For a demonstration: open the site shortly before presenting, create an account,
and load the sample data from Settings.

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
