import { SUPPORTED_LANGUAGES } from "../i18n/translations";

export default function LanguageSelector({ lang, onChange }) {
  return (
    <div className="lang-selector">
      <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)" }}>🌐</span>
      <select value={lang} onChange={(e) => onChange(e.target.value)} aria-label="Select language">
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
