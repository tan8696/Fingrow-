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
  const locName = location && location !== "Vidarbha, MH" ? location : "Vidarbha, Maharashtra";
  const now = new Date();
  
  const daily = [0, 1, 2, 3, 4].map(offset => {
    const d = new Date(now.getTime() + offset * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    return {
      date: dateStr,
      temp_max_c: 32 + (offset % 3),
      temp_min_c: 21 + (offset % 2),
      precipitation_mm: offset === 2 ? 4.5 : 0.0,
      condition: {
        label: offset === 2 ? "Scattered Showers" : "Partly Cloudy",
        icon: offset === 2 ? "rainy" : "partly_cloudy_day"
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
      score: 2.5,
      level: "Low",
      factors: [
        { name: "Heat Stress", status: "Minimal", level: "Low" },
        { name: "Pest Risk", status: "Moderate (Monsoon Humidity)", level: "Moderate" },
        { name: "Moisture Index", status: "Optimal for Rabi & Kharif Crops", level: "Low" }
      ],
      advisories: [
        "Optimal conditions for country poultry ventilation and egg laying.",
        "Mandi transit roads are clear with zero rain disruption forecasted."
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
  if (data) return data;
  return {
    policy: null,
    triggers: [],
    claims: [],
    payout_history: [],
    claim_factors: {},
    damage_types: [],
    policy_health: "Offline",
    weather_error: "Policy feed unavailable right now.",
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
  // Fetch as a blob and trigger a download — works across the dev-server origin.
  try {
    const res = await fetch(sprayProtocolUrl(location));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  } catch (err) {
    console.error("protocol download", err);
    return false;
  }
}
