const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api" : "/api");

export async function generateReport({ location, margin_capital, business_category, language, radius_km }) {
  const res = await fetch(`${API_BASE}/generate-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location, margin_capital, business_category, language, radius_km }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Report generation failed");
  }
  return res.json();
}

export async function calculateOnly(margin_capital) {
  const res = await fetch(`${API_BASE}/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ margin_capital }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Calculation failed");
  }
  return res.json();
}

export function getPDFUrl(sessionId) {
  return `${API_BASE}/report/${sessionId}/pdf`;
}

export async function submitLoanApplication(payload) {
  const res = await fetch(`${API_BASE}/loans/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Application submission failed");
  }
  return res.json();
}

export async function fetchMarketPrices() {
  const res = await fetch(`${API_BASE}/market-prices`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Fetching market prices failed");
  }
  return res.json();
}

export async function fetchLoanHistory() {
  const res = await fetch(`${API_BASE}/loan-history`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Fetching loan history failed");
  }
  return res.json();
}

export async function approveLoanApplication(applicationId, body = {}) {
  const res = await fetch(`${API_BASE}/loans/${applicationId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Approval failed");
  }
  return res.json();
}

export async function fetchLoanStatement(applicationId) {
  const res = await fetch(`${API_BASE}/loans/${applicationId}/statement`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Statement download failed");
  }
  return res.blob();
}

export async function fetchRepaymentStatus(applicationId) {
  const res = await fetch(`${API_BASE}/loans/${applicationId}/repayment`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Fetching repayment status failed");
  }
  return res.json();
}

export async function markRepaymentPaid(applicationId, month) {
  const res = await fetch(`${API_BASE}/loans/${applicationId}/repayments/${month}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Recording payment failed");
  }
  return res.json();
}

export async function fetchWeather(location = "") {
  const qs = location ? `?location=${encodeURIComponent(location)}` : "";
  const res = await fetch(`${API_BASE}/weather${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Weather unavailable");
  }
  return res.json();
}

export async function fetchPortfolio() {
  const res = await fetch(`${API_BASE}/portfolio`);
  if (!res.ok) throw new Error("Failed to load portfolio figures");
  return res.json();
}

export async function fetchPortfolioCashflow() {
  const res = await fetch(`${API_BASE}/portfolio/cashflow?horizon=6`);
  if (!res.ok) throw new Error("Failed to load cashflow forecast");
  return res.json();
}

export async function fetchHarvestLogs() {
  const res = await fetch(`${API_BASE}/harvest`);
  if (!res.ok) throw new Error("Failed to load harvest logs");
  return res.json();
}

export async function submitHarvest(payload) {
  const res = await fetch(`${API_BASE}/harvest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Harvest logging failed");
  }
  return res.json();
}

export async function deleteHarvest(harvestId) {
  const res = await fetch(`${API_BASE}/harvest/${harvestId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
  return res.json();
}

export async function fetchNotifications() {
  const res = await fetch(`${API_BASE}/notifications`);
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
}

export async function fetchClusterActivity() {
  const res = await fetch(`${API_BASE}/cluster/activity`);
  if (!res.ok) throw new Error("Failed to load cluster activity");
  return res.json();
}
