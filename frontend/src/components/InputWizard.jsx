import { useState, useEffect } from "react";
import { calculateOnly } from "../hooks/useReport";

const CATEGORIES = [
  { id: "dairy",          emoji: "🐄", label: "Dairy" },
  { id: "grocery",        emoji: "🛒", label: "Grocery" },
  { id: "vegetables",     emoji: "🥦", label: "Vegetables" },
  { id: "pharmacy",       emoji: "💊", label: "Pharmacy" },
  { id: "tailoring",      emoji: "🧵", label: "Tailoring" },
  { id: "electronics",    emoji: "📱", label: "Electronics" },
  { id: "restaurant",     emoji: "🍽️", label: "Restaurant" },
  { id: "bakery",         emoji: "🥖", label: "Bakery" },
  { id: "hardware",       emoji: "🔧", label: "Hardware" },
  { id: "clothing",       emoji: "👗", label: "Clothing" },
  { id: "cattle_feed",    emoji: "🌾", label: "Cattle Feed" },
  { id: "flour_mill",     emoji: "⚙️",  label: "Flour Mill" },
  { id: "beauty_parlour", emoji: "💄", label: "Beauty Parlour" },
  { id: "poultry",        emoji: "🐓", label: "Poultry" },
  { id: "fuel",           emoji: "⛽", label: "Fuel Station" },
  { id: "auto_repair",    emoji: "🔩", label: "Auto Repair" },
  { id: "stationery",     emoji: "📚", label: "Stationery" },
  { id: "fertilizer",     emoji: "🌱", label: "Fertilizer" },
  { id: "general_store",  emoji: "🏪", label: "General Store" },
];

const STEPS = ["Location", "Capital", "Business"];

function formatINR(amount) {
  if (!amount || isNaN(amount)) return "—";
  return "₹" + Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function InputWizard({ t, onSubmit, loading, onCancel }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    location: "",
    margin_capital: "",
    business_category: "",
  });
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});

  // Live cost preview when margin_capital changes
  useEffect(() => {
    const val = parseFloat(form.margin_capital);
    if (!isNaN(val) && val > 0) {
      const projectCost = val / 0.10;
      const loan = projectCost * 0.90;
      setPreview({ projectCost, loan, margin: val });
    } else {
      setPreview(null);
    }
  }, [form.margin_capital]);

  function validate(stepIndex) {
    const errs = {};
    if (stepIndex === 0) {
      if (!form.location.trim() || form.location.trim().length < 5)
        errs.location = "Please enter a more detailed location (village, district, state).";
    }
    if (stepIndex === 1) {
      const val = parseFloat(form.margin_capital);
      if (isNaN(val) || val <= 0)
        errs.margin_capital = "Enter a valid positive amount.";
      if (val > 500000)
        errs.margin_capital = "Maximum margin capital is ₹5,00,000 (project cost limit ₹50L).";
    }
    if (stepIndex === 2) {
      if (!form.business_category)
        errs.business_category = "Please select a business category.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (validate(step)) setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
    setErrors({});
  }

  function handleSubmit() {
    if (!validate(2)) return;
    onSubmit({
      location: form.location,
      margin_capital: parseFloat(form.margin_capital),
      business_category: form.business_category,
      radius_km: 10,
    });
  }

  return (
    <div className="card animate-in">
      {/* Step Indicator */}
      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div className={`wizard-step ${i === step ? "active" : i < step ? "completed" : ""}`}>
              <div className="wizard-step__number">
                {i < step ? "✓" : i + 1}
              </div>
              <span className="wizard-step__label">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`wizard-connector ${i < step ? "completed" : ""}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Location */}
      {step === 0 && (
        <div className="animate-in">
          <div className="form-group">
            <label className="form-label" htmlFor="location-input">
              {t.locationLabel}
            </label>
            <input
              id="location-input"
              className="form-input"
              type="text"
              placeholder={t.locationPlaceholder}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleNext()}
              autoFocus
            />
            {errors.location && <span className="form-error">{errors.location}</span>}
            <span className="form-hint">{t.locationHint}</span>
          </div>
          <div className="btn-group">
            {onCancel && (
              <button className="btn btn-secondary" onClick={onCancel} type="button">
                ← Back to Report
              </button>
            )}
            <button className="btn btn-primary" style={onCancel ? { flex: 1 } : undefined} onClick={handleNext} id="location-next-btn">
              {t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Capital */}
      {step === 1 && (
        <div className="animate-in">
          <div className="form-group">
            <label className="form-label" htmlFor="capital-input">
              {t.capitalLabel}
            </label>
            <div className="amount-input-wrapper">
              <span className="amount-input-prefix">₹</span>
              <input
                id="capital-input"
                className="form-input"
                type="number"
                placeholder="e.g., 25000"
                min="1"
                max="500000"
                value={form.margin_capital}
                onChange={(e) => setForm({ ...form, margin_capital: e.target.value })}
                autoFocus
              />
            </div>
            {errors.margin_capital && <span className="form-error">{errors.margin_capital}</span>}
            <span className="form-hint">{t.capitalHint}</span>
          </div>

          {/* Live Cost Preview */}
          {preview && (
            <div className="cost-preview animate-in">
              <div className="cost-preview__item">
                <div className="cost-preview__value" style={{ color: "#059669" }}>
                  {formatINR(preview.margin)}
                </div>
                <div className="cost-preview__label">{t.yourCapital} (10%)</div>
              </div>
              <div className="cost-preview__item">
                <div className="cost-preview__value">{formatINR(preview.projectCost)}</div>
                <div className="cost-preview__label">{t.projectCost}</div>
              </div>
              <div className="cost-preview__item">
                <div className="cost-preview__value" style={{ color: "#1d4ed8" }}>
                  {formatINR(preview.loan)}
                </div>
                <div className="cost-preview__label">{t.loanAmount} (90%)</div>
              </div>
            </div>
          )}

          <div className="btn-group">
            <button className="btn btn-secondary" onClick={handleBack} id="capital-back-btn">{t.back}</button>
            <button className="btn btn-primary" onClick={handleNext} style={{ flex: 1 }} id="capital-next-btn">{t.next}</button>
          </div>
        </div>
      )}

      {/* Step 3: Category */}
      {step === 2 && (
        <div className="animate-in">
          <div className="form-group">
            <label className="form-label">{t.categoryLabel}</label>
            <div className="category-grid">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  id={`cat-${cat.id}`}
                  className={`category-card ${form.business_category === cat.id ? "selected" : ""}`}
                  onClick={() => setForm({ ...form, business_category: cat.id })}
                  type="button"
                >
                  <span className="category-card__emoji">{cat.emoji}</span>
                  <span className="category-card__label">{cat.label}</span>
                </button>
              ))}
            </div>
            {errors.business_category && (
              <span className="form-error" style={{ marginTop: "8px", display: "block" }}>
                {errors.business_category}
              </span>
            )}
          </div>
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={handleBack} id="cat-back-btn">{t.back}</button>
            <button
              id="generate-report-btn"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleSubmit}
              disabled={loading || !form.business_category}
            >
              {loading ? (
                <><div className="spinner" /> {t.generating}</>
              ) : (
                t.generate
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
