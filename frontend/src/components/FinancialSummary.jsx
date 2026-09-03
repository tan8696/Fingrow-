import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

function formatINR(val) {
  return "₹" + Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const COLORS = ["#10b981", "#1d4ed8"];

export default function FinancialSummary({ financials, amortization, t }) {
  const { margin_contribution, project_cost, loan_amount,
          selected_scheme, interest_rate_pct, tenure_months, moratorium_months } = financials;

  const pieData = [
    { name: `${t.yourCapital} (10%)`, value: margin_contribution },
    { name: `${t.loanAmount} (90%)`, value: loan_amount },
  ];

  const isMicro = selected_scheme.toLowerCase().includes("micro");

  return (
    <div className="card animate-in">
      <div className="section-heading">
        <div className="section-heading__icon section-heading__icon--blue">💰</div>
        <div className="section-heading__text">
          <h2>{t.financials}</h2>
          <p>Deterministic financial routing based on your margin capital</p>
        </div>
      </div>

      {/* Scheme Badge */}
      <span className={`scheme-badge ${isMicro ? "scheme-badge--micro" : "scheme-badge--term"}`}>
        {isMicro ? "🟢" : "🔵"} {selected_scheme}
      </span>

      {/* Metrics Grid */}
      <div className="fin-metrics-grid">
        <div className="fin-metric">
          <div className="fin-metric__value" style={{ color: "#059669" }}>{formatINR(margin_contribution)}</div>
          <div className="fin-metric__label">{t.yourCapital} (10%)</div>
        </div>
        <div className="fin-metric">
          <div className="fin-metric__value">{formatINR(project_cost)}</div>
          <div className="fin-metric__label">{t.projectCost}</div>
        </div>
        <div className="fin-metric">
          <div className="fin-metric__value" style={{ color: "#1d4ed8" }}>{formatINR(loan_amount)}</div>
          <div className="fin-metric__label">{t.loanAmount} (90%)</div>
        </div>
      </div>

      {/* Details Row */}
      <div className="fin-details-row">
        <div className="fin-detail">
          <span className="fin-detail__label">Interest Rate</span>
          <span className="fin-detail__value">{interest_rate_pct}% p.a.</span>
        </div>
        <div className="fin-detail">
          <span className="fin-detail__label">Tenure</span>
          <span className="fin-detail__value">{tenure_months} months ({tenure_months / 12} yrs)</span>
        </div>
        <div className="fin-detail">
          <span className="fin-detail__label">Moratorium</span>
          <span className="fin-detail__value">{moratorium_months} months</span>
        </div>
        {amortization && (
          <div className="fin-detail">
            <span className="fin-detail__label">{t.quarterlyEMI}</span>
            <span className="fin-detail__value">{formatINR(amortization.quarterly_emi)}</span>
          </div>
        )}
      </div>

      {/* Pie Chart */}
      <div style={{ height: 200, marginTop: "16px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {pieData.map((_, index) => (
                <Cell key={index} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip formatter={(val) => formatINR(val)} />
            <Legend formatter={(val) => <span style={{ fontSize: "0.78rem" }}>{val}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
