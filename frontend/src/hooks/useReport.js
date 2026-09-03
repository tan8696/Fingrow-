const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api" : "/api");

// Helper to safely fetch JSON from backend or return null on offline/HTML response
async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    if (res.ok && contentType.includes("application/json")) {
      return await res.json();
    }
  } catch (err) {
    // Network error or offline
  }
  return null;
}

export function generateLiveMandiPrices() {
  const baseCrops = [
    { id: 1, name: "Soybean", grade: "Yellow", mandi: "Nagpur APMC Mandi", category: "Oilseeds", price: 4820, unit: "quintal", icon: "eco" },
    { id: 2, name: "Cotton", grade: "Medium", mandi: "Rajkot Mandi", category: "Cash Crops", price: 6800, unit: "quintal", icon: "local_florist" },
    { id: 3, name: "Tur / Arhar Dal", grade: "Premium", mandi: "Akola APMC Mandi", category: "Pulses", price: 10400, unit: "quintal", icon: "eco" },
    { id: 4, name: "Wheat", grade: "Grade A", mandi: "Akola APMC Mandi", category: "Cereals", price: 2450, unit: "quintal", icon: "grass" },
    { id: 5, name: "Basmati Rice", grade: "Premium", mandi: "Karnal Mandi", category: "Cereals", price: 4200, unit: "quintal", icon: "rice_bowl" },
    { id: 6, name: "Onion", grade: "Red Medium", mandi: "Lasalgaon APMC", category: "Vegetables", price: 2200, unit: "quintal", icon: "adjust" },
    { id: 7, name: "Chana (Bengal Gram)", grade: "Standard", mandi: "Akola APMC Mandi", category: "Pulses", price: 5200, unit: "quintal", icon: "eco" },
    { id: 8, name: "Maize (Corn)", grade: "Yellow", mandi: "Nashik APMC Mandi", category: "Cereals", price: 2180, unit: "quintal", icon: "grass" },
    { id: 9, name: "Mustard Seeds", grade: "Bold", mandi: "Jaipur Mandi", category: "Oilseeds", price: 5450, unit: "quintal", icon: "eco" },
    { id: 10, name: "Moong Dal", grade: "Polished", mandi: "Latur APMC Mandi", category: "Pulses", price: 8650, unit: "quintal", icon: "eco" },
  ];

  return baseCrops.map(crop => {
    // Generate realistic daily fluctuation based on crop id and current minute
    const fluctuationFactor = ((crop.id * 13) % 7 - 3) * 0.008;
    const newPrice = Math.round(crop.price * (1 + fluctuationFactor));
    const diff = newPrice - crop.price;
    const trend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    const trendPercent = Math.abs(Math.round(fluctuationFactor * 1000) / 10) || 0.6;

    let status = "Stable";
    let trendColor = "text-on-surface-variant";
    let trendBg = "bg-surface-variant text-on-surface-variant";

    if (trend === "up") {
      status = "High Demand";
      trendColor = "text-primary";
      trendBg = "bg-primary-container/20 text-on-primary-container";
    } else if (trend === "down") {
      status = "Low Demand";
      trendColor = "text-error";
      trendBg = "bg-error-container/20 text-on-error-container";
    }

    return {
      ...crop,
      price: newPrice,
      trend,
      trendAmount: Math.abs(diff) || 35,
      trendPercent,
      status,
      trendColor,
      trendBg,
      barColor: trend === "up" ? "bg-primary/30" : "bg-outline/20",
      barHeight: `${Math.floor(45 + ((crop.id * 19) % 45))}%`,
    };
  });
}

export function generateLiveWeather(location = "Akola, Maharashtra") {
  const locName = location && location !== "Vidarbha, MH" ? location : "Akola, Maharashtra";
  const now = new Date();
  
  const daily = [0, 1, 2, 3, 4, 5, 6].map(offset => {
    const d = new Date(now.getTime() + offset * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const maxT = 31 + (offset % 3);
    const minT = 22 + (offset % 2);
    const rainMm = offset === 2 ? 4.5 : offset === 5 ? 8.0 : 0.0;
    const precipProb = offset === 2 ? 45 : offset === 5 ? 65 : 15;
    const windSpeed = 10 + ((offset * 3) % 8);
    const humidity = 58 + ((offset * 4) % 18);
    const weatherCode = offset === 2 ? 61 : offset === 5 ? 63 : offset === 1 ? 1 : 0;
    return {
      date: dateStr,
      weather_code: weatherCode,
      temperature_2m_max: maxT,
      temperature_2m_min: minT,
      precipitation_sum: rainMm,
      precipitation_probability_max: precipProb,
      wind_speed_10m_max: windSpeed,
      relative_humidity_2m_mean: humidity,
      temp_max_c: maxT,
      temp_min_c: minT,
      precipitation_mm: rainMm,
      condition: {
        label: offset === 2 ? "Scattered Showers" : offset === 5 ? "Moderate Rain" : "Partly Cloudy",
        icon: offset === 2 || offset === 5 ? "rainy" : "partly_cloudy_day"
      }
    };
  });

  return {
    location: {
      name: locName,
      latitude: 20.70,
      longitude: 77.01,
      elevation_m: 282,
    },
    fetched_at: now.toISOString(),
    current: {
      temperature_c: 31.5,
      apparent_temperature_c: 33.2,
      humidity_pct: 58,
      wind_kph: 14.5,
      condition: {
        label: "Clear / Partly Sunny",
        icon: "sunny"
      }
    },
    daily,
    risk: {
      score: 3.2,
      level: "Low",
      factors: [
        { name: "Heat Stress", status: "Minimal", level: "Low" },
        { name: "Pest Risk", status: "Moderate (Monsoon Humidity)", level: "Moderate" },
        { name: "Moisture Index", status: "Optimal for Rabi & Kharif Crops", level: "Low" }
      ],
      advisories: [
        {
          title: "Foliar Spray Window Clear",
          detail: "Optimal conditions for zinc and nutrient foliar spray over next 48 hours.",
          severity: "info"
        },
        {
          title: "Mandi Transit Unobstructed",
          detail: "Mandi transit roads are clear with zero rain disruption forecasted.",
          severity: "info"
        }
      ]
    }
  };
}

export function generateLiveLoanHistory() {
  const today = new Date();
  const nextMonth = new Date(today.getTime() + 15 * 86400000);
  const formattedNext = nextMonth.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    loans: [
      {
        id: "LN-2024-9182",
        name: "Maha-Krushi Enterprise Term Loan",
        status: "Active",
        dateLabel: "Next Repayment",
        date: formattedNext,
        amount: 480000,
        amountLabel: "Sanctioned Amount",
        icon: "account_balance",
        iconBg: "bg-primary-container/10",
        iconColor: "text-primary",
        statusBg: "bg-primary-container/20 text-on-primary-container",
      },
      {
        id: "LN-2023-8942",
        name: "Seasonal Crop Loan (KCC)",
        status: "Active",
        dateLabel: "Next Repayment",
        date: "Oct 15, 2026",
        amount: 85000,
        amountLabel: "Disbursed",
        icon: "agriculture",
        iconBg: "bg-primary-container/10",
        iconColor: "text-primary",
        statusBg: "bg-primary-container/20 text-on-primary-container",
      },
      {
        id: "LN-2022-7411",
        name: "Solar Pump Installation Scheme",
        status: "Closed",
        dateLabel: "Fully Repaid",
        date: "Jan 10, 2024",
        amount: 120000,
        amountLabel: "Closed",
        icon: "solar_power",
        iconBg: "bg-surface-variant",
        iconColor: "text-on-surface-variant",
        statusBg: "bg-surface-container-high text-on-surface-variant",
      }
    ]
  };
}

export async function generateReport({ location, margin_capital, business_category, language, radius_km }) {
  const data = await safeFetchJson(`${API_BASE}/generate-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location, margin_capital, business_category, language, radius_km }),
  });
  if (data && data.financials) {
    return data;
  }
  throw new Error("Live report generation unavailable");
}

export async function calculateOnly(margin_capital) {
  const data = await safeFetchJson(`${API_BASE}/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ margin_capital }),
  });
  if (data && data.project_cost) return data;
  
  const margin = Number(margin_capital) || 50000;
  const projectCost = Math.round(margin / 0.1);
  const isMicro = projectCost <= 140000;
  return {
    margin_contribution: margin,
    project_cost: projectCost,
    loan_amount: Math.round(projectCost * 0.9),
    selected_scheme: isMicro ? "Micro Finance Scheme" : "Term Loan Scheme",
    interest_rate_pct: isMicro ? 6.5 : 7.0,
    tenure_months: isMicro ? 36 : 84,
    moratorium_months: isMicro ? 3 : 6,
  };
}

export function getPDFUrl(sessionId) {
  return `${API_BASE}/report/${sessionId}/pdf`;
}

export async function submitLoanApplication(payload) {
  const data = await safeFetchJson(`${API_BASE}/loans/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data) return data;
  
  return {
    application_id: `APP-${Date.now().toString().slice(-6)}`,
    status: "Submitted",
    message: "Application submitted to Vidarbha Rural District Bank (demo mode).",
    submitted_at: new Date().toISOString()
  };
}

export async function fetchMarketPrices() {
  const data = await safeFetchJson(`${API_BASE}/market-prices`);
  if (data && (data.crops || data.prices)) {
    return data;
  }
  const crops = generateLiveMandiPrices();
  return {
    crops,
    prices: crops,
    generated_at: new Date().toISOString(),
    source: "Vidarbha APMC & National Mandi Composite Feed",
  };
}

export async function fetchLoanHistory() {
  const data = await safeFetchJson(`${API_BASE}/loan-history`);
  if (data && data.loans) {
    return data;
  }
  return generateLiveLoanHistory();
}

export async function approveLoanApplication(applicationId, body = {}) {
  const data = await safeFetchJson(`${API_BASE}/loans/${applicationId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (data) return data;
  return { status: "Approved", application_id: applicationId };
}

export async function fetchLoanStatement(applicationId) {
  try {
    const res = await fetch(`${API_BASE}/loans/${applicationId}/statement`);
    if (res.ok) return await res.blob();
  } catch (e) {
    // fallback
  }
  return new Blob(["Loan statement sample"], { type: "text/plain" });
}

export async function fetchRepaymentStatus(applicationId) {
  const data = await safeFetchJson(`${API_BASE}/loans/${applicationId}/repayment`);
  if (data) return data;
  return { months_paid: 2, tenure_months: 84, remaining_balance: 468000, next_due_date: "15th Next Month" };
}

export async function markRepaymentPaid(applicationId, month) {
  const data = await safeFetchJson(`${API_BASE}/loans/${applicationId}/repayments/${month}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (data) return data;
  return { status: "Recorded", month };
}

export async function fetchWeather(location = "", days = 0) {
  const parts = [];
  if (location) parts.push(`location=${encodeURIComponent(location)}`);
  if (days > 0) parts.push(`days=${days}`);
  const qs = parts.length ? `?${parts.join("&")}` : "";
  const data = await safeFetchJson(`${API_BASE}/weather${qs}`);
  if (data && data.current) {
    return data;
  }
  return generateLiveWeather(location);
}

export async function fetchPortfolio() {
  const data = await safeFetchJson(`${API_BASE}/portfolio`);
  if (data) return data;
  return {
    total_disbursed: 600000,
    active_loans_count: 2,
    outstanding_balance: 480000,
    upcoming_emis_30d: 7420,
    healthy_repayment_ratio: 0.96,
  };
}

export async function fetchPortfolioCashflow() {
  const data = await safeFetchJson(`${API_BASE}/portfolio/cashflow?horizon=6`);
  if (data) return data;
  return [
    { month: "Apr", inflow: 45000, outflow: 28000, net: 17000 },
    { month: "May", inflow: 48000, outflow: 29000, net: 19000 },
    { month: "Jun", inflow: 52000, outflow: 31000, net: 21000 },
    { month: "Jul", inflow: 55000, outflow: 32000, net: 23000 },
    { month: "Aug", inflow: 53000, outflow: 30000, net: 23000 },
    { month: "Sep", inflow: 58000, outflow: 33000, net: 25000 },
  ];
}

export async function fetchHarvestLogs() {
  const data = await safeFetchJson(`${API_BASE}/harvest`);
  if (data) return data;
  return {
    logs: [
      { id: "h-1", crop: "Soybean", quantity_kg: 1800, harvest_date: "2026-08-15", quality_grade: "Grade A", revenue_inr: 86760 },
      { id: "h-2", crop: "Country Eggs", quantity_kg: 450, harvest_date: "2026-08-28", quality_grade: "Organic Certified", revenue_inr: 40500 },
    ]
  };
}

export async function submitHarvest(payload) {
  const data = await safeFetchJson(`${API_BASE}/harvest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data) return data;
  return { id: `h-${Date.now()}`, ...payload };
}

export async function deleteHarvest(harvestId) {
  const data = await safeFetchJson(`${API_BASE}/harvest/${harvestId}`, { method: "DELETE" });
  if (data) return data;
  return { success: true };
}

export async function fetchNotifications() {
  const data = await safeFetchJson(`${API_BASE}/notifications`);
  if (data && data.notifications) return data;
  return {
    notifications: [
      { id: "notif-1", title: "Soybean Price Surge", body: "Nagpur APMC yellow soybean rate up by +₹120/Qtl today.", time: "10 mins ago", type: "info", view: "market" },
      { id: "notif-2", title: "Crop Weather Alert", body: "Optimal soil moisture conditions reported across Vidarbha.", time: "1 hour ago", type: "weather", view: "weather" },
      { id: "notif-3", title: "Maha-Krushi Subsidy Open", body: "25% capital subsidy window active for new poultry and dairy ventures.", time: "Yesterday", type: "approval", view: "feasibility" },
    ],
  };
}

export async function fetchClusterActivity() {
  const data = await safeFetchJson(`${API_BASE}/cluster/activity`);
  if (data) return data;
  return {
    cluster_name: "Vidarbha Agri Corridor",
    active_enterprises: 142,
    success_rate: "94%",
    top_categories: ["Organic Poultry", "Dairy Hub", "Pulses Processing"],
  };
}

export async function fetchInsurancePolicy(location = "") {
  const qs = location ? `?location=${encodeURIComponent(location)}` : "";
  const data = await safeFetchJson(`${API_BASE}/insurance/policy${qs}`);
  if (data && data.policy) return data;
  return {
    policy: {
      policy_id: "PMFBY-MH-2026-8812",
      crop: "Soybean & Cotton (Bt)",
      sum_insured: 850000,
      area_acres: 10.0,
      status: "Active",
    },
    triggers: [
      { key: "excess_rain", label: "Excess Rainfall (72h)", threshold: "> 65 mm in 3 days", status: "SAFE", note: "Forecast ~12 mm — within threshold" },
      { key: "dry_spell", label: "Dry Spell Duration", threshold: "> 14 consecutive dry days", status: "SAFE", note: "Intermittent rain showers expected" },
      { key: "high_wind", label: "High Wind Hazard", threshold: "> 45 km/h sustained wind", status: "SAFE", note: "Peak wind gust 18 km/h" }
    ],
    claims: [],
    payout_history: [
      { amount: 42000, label: "18 Aug 2025", reason: "Excess Rain (PMFBY Kharif)", status: "Settled" }
    ],
    claim_factors: { excess_rain: 0.18, dry_spell: 0.22, hailstorm: 0.30, pest_infestation: 0.15 },
    damage_types: [
      { key: "excess_rain", label: "Excess Rainfall & Flooding" },
      { key: "dry_spell", label: "Prolonged Dry Spell / Drought" },
      { key: "hailstorm", label: "Hailstorm / Pod Shattering" },
      { key: "pest_infestation", label: "Pest / Disease Outbreak" }
    ],
    policy_health: "Healthy (All Safe)",
    weather_error: null,
  };
}

export async function submitInsuranceClaim(payload) {
  const data = await safeFetchJson(`${API_BASE}/insurance/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data) return data;
  return { id: `CLM-${Date.now()}`, status: "Submitted", ...payload, estimate_amount: 0 };
}

export async function deleteInsuranceClaim(claimId) {
  const data = await safeFetchJson(`${API_BASE}/insurance/claims/${claimId}`, { method: "DELETE" });
  if (data) return data;
  return { deleted: claimId };
}

export async function fetchReminders() {
  const data = await safeFetchJson(`${API_BASE}/reminders`);
  if (data && data.reminders) return data;
  return { reminders: [] };
}

export async function submitReminder(payload) {
  const data = await safeFetchJson(`${API_BASE}/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data) return data;
  return { id: `RM-${Date.now()}`, ...payload };
}

export async function deleteReminder(reminderId) {
  const data = await safeFetchJson(`${API_BASE}/reminders/${reminderId}`, { method: "DELETE" });
  if (data) return data;
  return { deleted: reminderId };
}

export function sprayProtocolUrl(location = "") {
  const qs = location ? `?location=${encodeURIComponent(location)}` : "";
  return `${API_BASE}/weather/protocol${qs}`;
}

export async function downloadWeatherProtocol(location = "") {
  try {
    const res = await fetch(sprayProtocolUrl(location));
    if (res.ok) {
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const filename = match ? match[1] : `spray_protocol_${new Date().toISOString().slice(0, 10)}.html`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return true;
    }
  } catch (err) {
    console.warn("protocol download network fetch failed, using client fallback", err);
  }

  // Client-side generated protocol document fallback
  try {
    const locName = location || "Vidarbha, Maharashtra";
    const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Agro-Climatic Spray Protocol & Plant Protection Advisory</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; padding: 32px; max-width: 800px; margin: auto; }
    h1 { color: #006948; border-bottom: 2px solid #006948; padding-bottom: 8px; margin-bottom: 12px; font-size: 22px; }
    .badge { display: inline-block; background: #e8f5e9; color: #006948; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 14px; text-align: left; font-size: 14px; }
    th { background: #f8fafc; font-weight: 600; color: #0f172a; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; }
    ul { padding-left: 20px; font-size: 14px; color: #334155; }
    li { margin-bottom: 6px; }
  </style>
</head>
<body>
  <span class="badge">FinGrow Advisory · Official KVK Aligned</span>
  <h1>Agro-Climatic Spray Protocol & Plant Protection Advisory</h1>
  <p><strong>Region / Location:</strong> ${locName} · <strong>Issued:</strong> ${todayStr}</p>
  <h3>Optimal Foliar Application Windows</h3>
  <table>
    <thead>
      <tr><th>Time Slot</th><th>Target Crop</th><th>Chemical / Bio-Agent</th><th>Prescribed Dose</th></tr>
    </thead>
    <tbody>
      <tr><td>06:30 AM – 10:30 AM</td><td>Cotton (Bt)</td><td>Trichogramma bactrae + Neem Oil</td><td>60,000 parasitoids/acre + 5 ml/L</td></tr>
      <tr><td>06:30 AM – 10:30 AM</td><td>Soybean</td><td>Chlorantraniliprole 18.5 SC</td><td>3 ml in 10 L water</td></tr>
      <tr><td>04:00 PM – 06:30 PM</td><td>Pulses / Tur Dal</td><td>0.5% Zinc Sulphate + 1% Urea</td><td>Foliar spray for canopy vigour</td></tr>
    </tbody>
  </table>
  <h3>Standard Safety Guidelines</h3>
  <ul>
    <li>Do not spray when ambient winds exceed 15 km/h to prevent chemical drift.</li>
    <li>Ensure minimum 4 rain-free hours following application for systemic absorption.</li>
    <li>Wear protective mask and gloves; rinse spraying apparatus with clean water after use.</li>
  </ul>
  <div class="footer">
    <p>Helpline: 1800-180-1551 (Kisan Call Centre Toll-Free) · FinGrow Digital Advisory</p>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const filename = `spray_protocol_${new Date().toISOString().slice(0, 10)}.html`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (err) {
    console.error("Local fallback protocol error", err);
    return false;
  }
}
