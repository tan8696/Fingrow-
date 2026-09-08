import { useState, useEffect, useMemo } from 'react';

function formatINR(amount) {
  if (!amount || isNaN(amount)) return '—';
  if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + 'L';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function computeMonthlyEMI(principal, annualRate, months) {
  if (!principal || !annualRate || !months) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(principal / months);
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(emi);
}

// Preset quick-pick amounts (in ₹)
const QUICK_PICKS = [10000, 25000, 50000, 100000, 250000, 500000];

/**
 * CapitalSlider — an interactive range slider that shows live financial
 * projections as the user adjusts their margin capital.
 *
 * Props:
 *   value      — current margin capital value (number)
 *   onChange   — callback(newValue) when slider changes
 *   min        — minimum (default 5000)
 *   max        — maximum (default 500000)
 */
export default function CapitalSlider({ value, onChange, min = 5000, max = 500000 }) {
  const [localVal, setLocalVal] = useState(value || 25000);

  useEffect(() => {
    if (value !== undefined && value !== localVal) {
      setLocalVal(value);
    }
  }, [value]);

  const derived = useMemo(() => {
    const margin = localVal;
    const projectCost = Math.round(margin / 0.10);
    const loanAmount = Math.round(projectCost * 0.90);
    const isMicro = projectCost <= 140000;
    const scheme = isMicro ? 'Micro Finance' : 'Term Loan';
    const rate = isMicro ? 6.5 : 8.0;
    const tenureMonths = isMicro ? 36 : 84;
    const monthlyEMI = computeMonthlyEMI(loanAmount, rate, tenureMonths);
    return { margin, projectCost, loanAmount, scheme, rate, tenureMonths, monthlyEMI, isMicro };
  }, [localVal]);

  const handleSlider = (e) => {
    const v = Number(e.target.value);
    setLocalVal(v);
    onChange?.(v);
  };

  const handleQuickPick = (v) => {
    setLocalVal(v);
    onChange?.(v);
  };

  const pct = ((localVal - min) / (max - min)) * 100;

  return (
    <div className="capital-slider">
      {/* Main value display */}
      <div className="capital-slider__hero">
        <span className="capital-slider__hero-label">Your Capital</span>
        <span className="capital-slider__hero-value">{formatINR(localVal)}</span>
      </div>

      {/* Range slider */}
      <div className="capital-slider__track-wrapper">
        <input
          type="range"
          min={min}
          max={max}
          step={1000}
          value={localVal}
          onChange={handleSlider}
          className="capital-slider__range"
          style={{ '--slider-pct': `${pct}%` }}
          aria-label="Adjust your margin capital"
        />
        <div className="capital-slider__labels">
          <span>{formatINR(min)}</span>
          <span>{formatINR(max)}</span>
        </div>
      </div>

      {/* Quick-pick chips */}
      <div className="capital-slider__chips">
        {QUICK_PICKS.map(amt => (
          <button
            key={amt}
            type="button"
            onClick={() => handleQuickPick(amt)}
            className={`capital-slider__chip ${localVal === amt ? 'capital-slider__chip--active' : ''}`}
          >
            {formatINR(amt)}
          </button>
        ))}
      </div>

      {/* Live KPI cards */}
      <div className="capital-slider__kpis">
        <div className="capital-slider__kpi">
          <span className="capital-slider__kpi-icon">🏦</span>
          <span className="capital-slider__kpi-value">{formatINR(derived.loanAmount)}</span>
          <span className="capital-slider__kpi-label">Govt Loan (90%)</span>
        </div>
        <div className="capital-slider__kpi">
          <span className="capital-slider__kpi-icon">💳</span>
          <span className="capital-slider__kpi-value">{formatINR(derived.monthlyEMI)}</span>
          <span className="capital-slider__kpi-label">Monthly EMI</span>
        </div>
        <div className="capital-slider__kpi">
          <span className="capital-slider__kpi-icon">📊</span>
          <span className="capital-slider__kpi-value">{derived.rate}%</span>
          <span className="capital-slider__kpi-label">Interest Rate</span>
        </div>
      </div>

      {/* Scheme badge */}
      <div className={`capital-slider__scheme ${derived.isMicro ? 'capital-slider__scheme--micro' : 'capital-slider__scheme--term'}`}>
        <span className="material-symbols-outlined text-[16px]">verified</span>
        <span>{derived.scheme} Scheme</span>
        <span className="capital-slider__scheme-detail">
          {derived.tenureMonths / 12} years • {derived.rate}% p.a.
        </span>
      </div>
    </div>
  );
}

export { computeMonthlyEMI };
