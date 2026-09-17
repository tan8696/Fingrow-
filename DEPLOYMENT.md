# Deploying FinGrow

The frontend is already on Vercel. The backend is not deployed anywhere, which
is why signing in on the live site returns a 404 — the browser asks
`https://<your-site>.vercel.app/api/auth/signup`, and nothing there answers it.

This guide puts the API on Render's free plan and points the Vercel build at
it. Budget about fifteen minutes.

---

## 1. Deploy the API to Render

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. **New → Blueprint**, then pick the `Fingrow-` repository.
   Render reads [`render.yaml`](render.yaml) and proposes a service called
   `fingrow-api`. Accept it.
3. Render will ask for the values marked secret:

   | Variable | Needed? | What happens without it |
   |---|---|---|
   | `GROQ_API_KEY` | **Yes** | Feasibility reports and the stress test return 503 |
   | `BHASHINI_API_KEY` | Optional | Report translation falls back to MyMemory |
   | `DATA_GOV_API_KEY` | Optional | Mandi prices serve a clearly labelled sample feed |

   Copy them from your local `backend/.env`.
4. Deploy, and wait for the first build. When it finishes Render shows a URL
   like `https://fingrow-api.onrender.com`.
5. Confirm it is alive by opening `https://fingrow-api.onrender.com/api/health`
   — it should return `{"status":"ok", ...}`.

### If your Vercel project is not called `fingrow`

`render.yaml` sets `CORS_ORIGIN_REGEX` to match `fingrow.vercel.app` and its
preview URLs. If your site is on a different name or a custom domain, edit that
variable in the Render dashboard, or the browser will block every request:

```
^https://your-project-name(-[a-z0-9-]+)?\.vercel\.app$
```

For a custom domain, put it in `CORS_ORIGINS` instead (comma separated).

---

## 2. Point Vercel at the API

1. Vercel dashboard → the `fingrow` project → **Settings → Environment
   Variables**.
2. Add, for all environments:

   ```
   VITE_API_URL = https://fingrow-api.onrender.com/api
   ```

   The `/api` suffix matters — the frontend appends paths like `/auth/signup`
   directly to it.
3. **Redeploy.** Vite inlines environment variables at build time, so an
   existing deployment will not pick this up until it is rebuilt.

---

## 3. Check it

Open the live site and create an account. If it fails, the error now names the
cause:

| Message | Meaning |
|---|---|
| `No API found at …` | `VITE_API_URL` is unset or wrong, or you have not redeployed since setting it |
| `Cannot reach the server at …` | The API is down, or CORS is rejecting your domain — check `CORS_ORIGIN_REGEX` |
| `The server is not responding` | The API is starting up; wait a moment and retry |

---

## Two things to know about the free plan

**It sleeps.** Render spins a free service down after about fifteen minutes of
inactivity, and the next request has to wait roughly fifty seconds for it to
start again. Before demonstrating, open the `/api/health` URL once to wake it
up, and keep the tab open.

**Storage is temporary.** The free plan has no persistent disk, so the SQLite
databases are wiped on every deploy and every restart. Accounts created before
a restart will not survive it.

That matters less here than it would for a real service, because the app is
designed to start empty and has a one-click sample data loader in Settings. For
a judged demo, create your account on the day and load the sample data.

If you need data to persist, uncomment the `disk` block in `render.yaml` and
change the `*_DB_PATH` variables from `/tmp/fingrow/` to `/var/data/`. Render
disks require a paid instance (about $7/month).

---

## Running locally

Deployment is optional. Two terminals:

```bash
cd backend && python -m uvicorn app.main:app --reload
```

```bash
cd frontend && npm run dev
```

Leave `VITE_API_URL` unset locally — Vite proxies `/api` to port 8000, which
keeps requests same-origin and avoids CORS entirely.
