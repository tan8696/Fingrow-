import { useState, useRef, useEffect } from 'react';

/**
 * Dictionary of financial jargon → plain-language explanations.
 * Each entry has `en` (English) and `hi` (Hindi) variants.
 */
const JARGON = {
  moratorium: {
    en: 'Grace Period — months before your first loan payment starts. You only pay interest during this time.',
    hi: 'छूट अवधि — आपका पहला भुगतान शुरू होने से पहले के महीने। इस दौरान सिर्फ ब्याज देना होता है।',
  },
  amortization: {
    en: 'Your Payment Schedule — a table showing how each instalment is split between principal (the money you borrowed) and interest (the bank\'s fee).',
    hi: 'भुगतान अनुसूची — एक तालिका जो दिखाती है कि हर किस्त में कितना मूलधन (उधार लिया गया पैसा) और कितना ब्याज (बैंक शुल्क) है।',
  },
  emi: {
    en: 'Monthly Instalment — the fixed amount you pay every month to repay your loan.',
    hi: 'मासिक किस्त — हर महीने ऋण चुकाने के लिए दी जाने वाली निश्चित राशि।',
  },
  principal: {
    en: 'The actual money you borrowed from the bank (not including interest).',
    hi: 'वह वास्तविक धनराशि जो आपने बैंक से उधार ली (ब्याज को छोड़कर)।',
  },
  interest: {
    en: 'The bank\'s fee for lending you money — calculated as a percentage of your remaining loan.',
    hi: 'बैंक द्वारा पैसे उधार देने का शुल्क — आपके बकाया ऋण के प्रतिशत के रूप में गणना किया जाता है।',
  },
  margin_capital: {
    en: 'Your Own Money — the amount you contribute from your savings. The government funds the rest.',
    hi: 'आपका अपना पैसा — वह राशि जो आप अपनी बचत से देते हैं। बाकी सरकार देती है।',
  },
  project_cost: {
    en: 'Total Business Cost — the full amount needed to start your business (your money + the loan).',
    hi: 'कुल व्यवसाय लागत — आपके व्यवसाय को शुरू करने के लिए आवश्यक कुल राशि (आपका पैसा + ऋण)।',
  },
  subsidy: {
    en: 'Government Gift — a portion of money the government gives you that you DON\'T have to repay.',
    hi: 'सरकारी अनुदान — सरकार द्वारा दी गई धनराशि जो आपको वापस नहीं करनी होती।',
  },
  tenure: {
    en: 'Loan Duration — the total number of months/years you have to repay the full loan.',
    hi: 'ऋण अवधि — पूरा ऋण चुकाने के लिए आपके पास कुल कितने महीने/वर्ष हैं।',
  },
  reducing_balance: {
    en: 'Fair Interest — interest is charged only on the remaining loan amount, not the original. So your interest decreases each month!',
    hi: 'उचित ब्याज — ब्याज केवल बकाया राशि पर लगता है, मूल राशि पर नहीं। इसलिए हर महीने ब्याज कम होता है!',
  },
  scheme: {
    en: 'Government Loan Plan — a specific loan programme with fixed interest rates and rules designed for small businesses.',
    hi: 'सरकारी ऋण योजना — छोटे व्यवसायों के लिए निश्चित ब्याज दरों और नियमों वाला ऋण कार्यक्रम।',
  },
  quarterly_emi: {
    en: 'Payment Every 3 Months — instead of paying monthly, you pay once every quarter (Jan, Apr, Jul, Oct).',
    hi: 'हर 3 महीने में भुगतान — मासिक भुगतान की बजाय हर तिमाही में एक बार भुगतान (जनवरी, अप्रैल, जुलाई, अक्टूबर)।',
  },
  collateral: {
    en: 'Security — an asset (like land or property) you pledge to the bank as a guarantee for the loan.',
    hi: 'गारंटी — बैंक को ऋण की गारंटी के रूप में रखी गई संपत्ति (जैसे जमीन या मकान)।',
  },
  disbursement: {
    en: 'Loan Release — when the bank actually transfers the approved loan money to your account.',
    hi: 'ऋण वितरण — जब बैंक वास्तव में स्वीकृत ऋण राशि आपके खाते में भेजता है।',
  },
  kcc: {
    en: 'Kisan Credit Card — a special credit facility for farmers with low interest rates and flexible repayment.',
    hi: 'किसान क्रेडिट कार्ड — किसानों के लिए कम ब्याज और लचीले भुगतान वाली विशेष क्रेडिट सुविधा।',
  },
};

/**
 * JargonTooltip — wraps a financial term with an info icon.
 * On hover/tap, shows a plain-language explanation popup.
 *
 * Props:
 *   term       — key into the JARGON dictionary (e.g. "moratorium")
 *   label      — optional display text (defaults to capitalised term)
 *   lang       — "en" or "hi" (defaults to "en")
 *   children   — if provided, wraps around children instead of label
 */
export default function JargonTooltip({ term, label, lang = 'en', children }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef(null);
  const entry = JARGON[term?.toLowerCase()];

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (tipRef.current && !tipRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!entry) {
    return children || <span>{label || term}</span>;
  }

  const displayLabel = label || term?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const explanation = entry[lang] || entry.en;

  return (
    <span className="jargon-tooltip-wrapper" ref={tipRef}>
      <span
        className="jargon-tooltip-trigger"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        role="button"
        tabIndex={0}
        aria-label={`Explain: ${displayLabel}`}
      >
        {children || displayLabel}
        <span className="jargon-tooltip-icon">ⓘ</span>
      </span>

      {open && (
        <span className="jargon-tooltip-popup">
          <span className="jargon-tooltip-popup__title">{displayLabel}</span>
          <span className="jargon-tooltip-popup__body">{explanation}</span>
        </span>
      )}
    </span>
  );
}

export { JARGON };
