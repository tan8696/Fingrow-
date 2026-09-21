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

What still depends on the instance, until a database is connected (below):

- **Signing in again after signing out.** Signing in checks the password
  against a stored hash; an instance that never saw the account does not have
  one.
- **Records you create yourself**, such as a logged harvest, an applied-for loan,
  or a saved report's verify/PDF/stress-test link. These live on the instance
  that created them.

### Make data permanent: connect a Postgres database

This takes about a minute and stays free. Nothing needs copying: Vercel passes
the connection details to the API itself.

1. Vercel dashboard → `sih-project` → **Storage** → **Create Database**.
2. Choose **Neon** (Serverless Postgres), accept the free plan, and keep the
   region Vercel suggests, because it matches where the API runs. A distant region
   makes every page slower.
3. **Connect** it to `sih-project` for Production (and Preview if you want).
   Vercel adds `DATABASE_URL` to the project's environment variables.
4. **Redeploy**: Deployments → the latest one → ⋯ → **Redeploy**. Functions
   only read environment variables at start-up.

Then open
[`/api/health`](https://sih-project-rosy-delta.vercel.app/api/health) and check
it says `"engine": "postgres", "persistent": true`. Before connecting it says
`"engine": "sqlite", "persistent": false`.

The API creates its tables on first use. Accounts made before connecting lived
in `/tmp` and are not carried over, so sign up again once.

Supabase works the same way; it sets `POSTGRES_URL`, which is also read. See
[`backend/app/core/db.py`](backend/app/core/db.py) for how one set of store
code runs on both SQLite and Postgres.

[`render.yaml`](render.yaml) remains as an alternative host for the API if you
ever need one, but with a database connected the Vercel setup needs nothing
else.

---

## Troubleshooting

The sign-in screen names the cause when something is wrong:

| Message | Meaning |
|---|---|
| `No API found at /api` | The deployment has no API function; check the build log for `api/index.py` |
| Signing in says the password is wrong for an account that exists | Data is in temporary storage and the instance was recycled. `/api/health` will show `"persistent": false`. Connect a database (above) |
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

To run the test suite against Postgres as well as SQLite, point
`TEST_DATABASE_URL` at a **disposable** database; the suite drops the app's
tables at the start of the run. A real `DATABASE_URL` is always ignored by
the tests.
