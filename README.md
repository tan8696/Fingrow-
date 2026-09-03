# AI Business Advisory Assistant & Smart Scheme Calculator

> **An NLP-powered, multilingual rural micro-enterprise feasibility and financial routing platform for Indian entrepreneurs.**

Built for the **Smart India Hackathon (SIH)**, this system democratizes institutional-grade business consulting. Prospective rural micro-entrepreneurs provide three straightforward inputs:
1. **Geographic Location** (Village, Block, District, State)
2. **Available Margin Capital** (₹, User's own contribution)
3. **Proposed Business Category** (e.g., Dairy, Grocery, Poultry, Tailoring)

The platform evaluates local market feasibility, scans actual competitors in a 5–10 km radius via OpenStreetMap, applies strict deterministic rules to structure the concessional government loan, and outputs a downloadable, bank-ready **Business Feasibility & Financial Amortization Report**.

---

## 🏛️ Core Architecture & Strict Separation of Concerns

```
                               ┌───────────────────────────────────┐
                               │       React + Vite PWA (UI)       │
                               │   Multilingual (Hindi, English)   │
                               │  3-Step Wizard + Live Estimator   │
                               └─────────────────┬─────────────────┘
                                                 │ HTTP JSON API
                               ┌─────────────────▼─────────────────┐
                               │          FastAPI Backend          │
                               │          (Python 3.10+)           │
                               └───────┬──────────────┬────────────┘
                                       │              │
                     ┌─────────────────┴────┐   ┌─────┴─────────────────┐
                     │ Deterministic Engine │   │   Market Intelligence │
                     │   (Rule-Based Math)  │   │  (OSM + LLM Advisory) │
                     └─────────┬────────────┘   └─────┬─────────────────┘
                               │                      │
                   ┌───────────┴──────────┐     ┌─────┴───────────────┐
                   │  calculator.py       │     │ geocoder.py         │
                   │  - 10% Margin Math   │     │ - Nominatim API     │
                   │  - Scheme Routing    │     │ osm_fetcher.py      │
                   │  amortization.py     │     │ - Overpass API      │
                   │  - Reducing Balance  │     │ advisory.py         │
                   │  - Moratorium Logic  │     │ - Gemini 1.5 Flash  │
                   └──────────────────────┘     │ translator.py       │
                                                │ - Bhashini / Google │
                                                └─────────────────────┘
```

### Deterministic Financial Engine (No Hallucination Risk)
Financial structuring is **never** delegated to an LLM. All financial math is hardcoded in strict, rule-based Python:
- **Project Cost Math**: `Project Cost = Available Capital / 0.10`
- **Loan Math**: `Loan Amount = Project Cost * 0.90`
- **Routing Gates**:
  - `Project Cost <= ₹1,40,000`: **Micro Finance Scheme** (6.5% interest, 3-year tenure / 36 months, 3-month moratorium).
  - `₹1,40,000 < Project Cost <= ₹50,00,000`: **Term Loan Scheme** (8.0% interest, 7-year tenure / 84 months, 6-month moratorium).
  - `Project Cost > ₹50,00,000`: Rejected (exceeds maximum scheme bounds).
- **Repayment Math**: Quarterly reducing-balance amortization with interest-only payments during the moratorium period.

### Geospatial Market Intelligence (Ground Truth)
- **Nominatim Geocoding**: Normalizes freeform village/block strings to precise coordinates.
- **OpenStreetMap Overpass API**: Directly queries existing competitor points-of-interest (POIs) in a 5–10 km radius.
- **Strictly Bounded LLM Prompt**: The Gemini 1.5 Flash model is supplied with real competitor density and financial figures as ground truth. The system prompt strictly prohibits fabricating demographic data or inventing market statistics.

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

Add your Groq API key to `backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Optional settings (see `.env.example`):
- `GROQ_MODEL` — advisory model (default `openai/gpt-oss-120b`).
- `SESSION_DB_PATH` — where generated reports are persisted (default: `backend/sessions.db`).

Run unit and integration tests:
```bash
python -m pytest tests -v
```

Start the FastAPI backend server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive API docs will be available at: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: [http://localhost:5173](http://localhost:5173)

---

## 📡 API Reference

### 1. Standalone Financial Calculator (Offline / Zero External Keys Needed)
`POST /api/calculate`
- **Request:**
  ```json
  { "margin_capital": 25000 }
  ```
- **Response:**
  ```json
  {
    "financials": {
      "margin_contribution": 25000.0,
      "project_cost": 250000.0,
      "loan_amount": 225000.0,
      "selected_scheme": "Term Loan Scheme",
      "interest_rate_pct": 8.0,
      "tenure_months": 84,
      "moratorium_months": 6
    },
    "amortization": {
      "quarterly_emi": 11155.0,
      "total_quarters": 28,
      "total_interest_paid": 74030.0,
      "total_amount_paid": 299030.0,
      "schedule": [ ... ]
    }
  }
  ```

### 2. Full Feasibility Report
`POST /api/generate-report`
- **Request:**
  ```json
  {
    "location": "Rampur Village, Barabanki, UP",
    "margin_capital": 25000,
    "business_category": "dairy",
    "language": "hi",
    "radius_km": 10.0
  }
  ```
- **Response:** `FullReportResponse` containing financials, amortization schedule, OSM survey summary, and SWOT analysis.

### 3. Download PDF Report
`GET /api/report/{session_id}/pdf`
- Generates and downloads a vector PDF with structured tables, financial metrics, and executive summary.

### 4. Loan Applications (Apply → Approve → Track → Statement)
`POST /api/loans/apply`
- Persists a loan application submitted from the feasibility report and returns it with a generated reference id (e.g. `LN-2026-4821`).

`POST /api/loans/{application_id}/approve`
- Bank-officer action: moves a `Pending` application to `Active`, generating a monthly EMI schedule from the scheme terms. Optional body fields `approved_amount`, `annual_rate_pct`, `tenure_months`, and `officer_note` let the officer adjust terms.

`GET /api/loans/{application_id}/repayment`
- Repayment-tracking state for an approved loan: outstanding principal, total paid, next due instalment/date, progress, and the full monthly schedule with paid flags.

`POST /api/loans/{application_id}/repayments/{month}`
- Records an EMI instalment as paid (in order only — out-of-order or duplicate payments return 409), advancing the outstanding balance. The state persists in SQLite across restarts.

`GET /api/loans/{application_id}/statement`
- Downloads the approved loan's full monthly repayment schedule as a CSV statement (409 until the loan is approved).

`GET /api/loan-history`
- Returns stored applications (newest first — pending and active, with EMI terms and the actual next due date once approved) followed by simulated demo loans.

---

## 🧪 Test Coverage Summary

The test suite includes 77 automated unit and integration tests:
- **Amortization Tests (`test_amortization.py`)**: Validates 3-month and 6-month moratorium interest-only schedules, final zero balance, sequential balance continuity, reducing-balance formulas.
- **Financial Engine Tests (`test_calculator.py`)**: Tests exact ₹14,000 threshold boundary, ₹14,001 crossover, 10× project cost multiplier, 90% loan calculation, and ₹50L upper cap.
- **API Tests (`test_api.py`)**: Tests `/health`, `/categories`, `/languages`, `/calculate`, and 422 error boundaries.
- **Session Store Tests (`test_session_store.py`)**: Validates SQLite persistence of generated reports, including survival across new connections (server restarts) and unknown-session handling.
- **Loan Store & Schedule Tests (`test_loan_store.py`, `test_loan_schedule.py`)**: Validate loan application persistence, the monthly EMI schedule math (zero final balance, consistent totals), and CSV statement rendering.
- **Loan API Tests (`test_api.py`)**: Cover apply → approve (with officer overrides and conflict handling) → repayment tracking (in-order validation, duplicates, full payoff) → statement download and the merged loan-history response (including next-due dates after payments).
- **Report Tests (`test_report.py`)**: Validates SVG chart generation, HTML report rendering, and ReportLab vector PDF compilation.

To execute tests:
```bash
python -m pytest tests -v
```

---

## 📄 License
MIT License. Developed for the Smart India Hackathon.
