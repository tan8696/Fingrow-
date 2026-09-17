import React, { useState } from 'react';
import { verifyReport } from '../hooks/useReport';

/**
 * DecisionReceipt — shows where every figure in a report came from, and lets
 * anyone re-derive the financial ones on the spot.
 *
 * Three kinds of source, deliberately styled differently so the distinction is
 * visible at a glance:
 *   rule        — computed by the fixed engine (green; carries full weight)
 *   observation — measured by an external feed such as OSM or Open-Meteo
 *   model       — written by the language model; narrative only, never math
 */

const KIND_STYLES = {
  rule: {
    icon: 'function',
    label: 'Rule',
    chip: 'bg-primary-container/25 text-on-primary-container',
    dot: 'bg-primary',
  },
  observation: {
    icon: 'satellite_alt',
    label: 'Measured',
    chip: 'bg-tertiary-container/25 text-on-tertiary-container',
    dot: 'bg-tertiary',
  },
  model: {
    icon: 'neurology',
    label: 'Model',
    chip: 'bg-surface-container-high text-on-surface-variant',
    dot: 'bg-outline',
  },
};

const VERDICTS = {
  verified: {
    icon: 'verified',
    title: 'Figures reproduce exactly',
    tone: 'bg-primary-container/25 text-on-primary-container',
  },
  rules_changed: {
    icon: 'history',
    title: 'Scheme rules changed since this report was issued',
    tone: 'bg-tertiary-container/25 text-on-tertiary-container',
  },
  mismatch: {
    icon: 'error',
    title: 'Figures do not reproduce — investigate',
    tone: 'bg-error-container/25 text-on-error-container',
  },
  unverifiable: {
    icon: 'help',
    title: 'Not enough recorded to re-derive',
    tone: 'bg-surface-container-high text-on-surface-variant',
  },
};

function fieldLabel(field) {
  return String(field || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DecisionReceipt({ receipt, sessionId }) {
  const [verdict, setVerdict] = useState(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!receipt) return null;

  const sources = receipt.sources || [];

  const runVerify = async () => {
    setChecking(true);
    try {
      setVerdict(await verifyReport(sessionId));
    } catch (err) {
      setVerdict({ status: 'unverifiable', reason: 'Could not reach the server to re-derive the figures.' });
    } finally {
      setChecking(false);
    }
  };

  const v = verdict ? VERDICTS[verdict.status] || VERDICTS.unverifiable : null;

  return (
    <section className="bg-surface-container-lowest rounded-3xl shadow-sm overflow-hidden mb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 p-card-padding-mobile md:p-card-padding-desktop border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary-container/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container">receipt_long</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Decision Receipt</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Reference {receipt.short_hash} · engine v{receipt.engine_version} · scheme rules {receipt.rules_fingerprint}
            </p>
          </div>
        </div>

        {sessionId && (
          <button
            onClick={runVerify}
            disabled={checking}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-primary text-on-primary font-label-lg text-label-lg disabled:opacity-60 transition-opacity"
          >
            <span className={`material-symbols-outlined text-[20px] ${checking ? 'animate-spin' : ''}`}>
              {checking ? 'progress_activity' : 'rule'}
            </span>
            {checking ? 'Re-deriving…' : 'Re-derive the figures'}
          </button>
        )}
      </header>

      {v && (
        <div className={`m-card-padding-mobile md:m-card-padding-desktop p-4 rounded-2xl ${v.tone}`}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined">{v.icon}</span>
            <div className="min-w-0">
              <p className="font-label-lg text-label-lg">{v.title}</p>
              {verdict.gate && (
                <p className="font-body-md text-body-md opacity-90 mt-1">Gate applied: {verdict.gate}</p>
              )}
              {verdict.reason && (
                <p className="font-body-md text-body-md opacity-90 mt-1">{verdict.reason}</p>
              )}
              {verdict.differences && (
                <ul className="mt-2 space-y-1 font-body-md text-body-md opacity-90">
                  {Object.entries(verdict.differences).map(([key, diff]) => (
                    <li key={key}>
                      {fieldLabel(key)}: issued {String(diff.issued)} → re-derived {String(diff.recomputed)}
                    </li>
                  ))}
                </ul>
              )}
              {verdict.checked_at && (
                <p className="font-label-sm text-label-sm opacity-70 mt-2">
                  Checked {new Date(verdict.checked_at).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-card-padding-mobile md:p-card-padding-desktop space-y-3">
        {sources.map((entry, i) => {
          const style = KIND_STYLES[entry.kind] || KIND_STYLES.observation;
          return (
            <div key={`${entry.field}-${i}`} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:w-52 shrink-0">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className="font-label-lg text-label-lg text-on-surface">{fieldLabel(entry.field)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm ${style.chip}`}>
                    <span className="material-symbols-outlined text-[14px]">{style.icon}</span>
                    {style.label}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{entry.source}</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">{entry.detail}</p>
              </div>
            </div>
          );
        })}

        <p className="pt-2 font-body-md text-body-md text-on-surface-variant border-t border-outline-variant">
          {receipt.note}
        </p>

        {receipt.inputs && (
          <div>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-1 font-label-md text-label-md text-primary min-h-[44px]"
            >
              <span className="material-symbols-outlined text-[18px]">
                {expanded ? 'expand_less' : 'expand_more'}
              </span>
              {expanded ? 'Hide' : 'Show'} the inputs these figures were derived from
            </button>
            {expanded && (
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(receipt.inputs).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 px-3 py-2 rounded-xl bg-surface-container-low">
                    <dt className="font-body-md text-body-md text-on-surface-variant">{fieldLabel(key)}</dt>
                    <dd className="font-label-md text-label-md text-on-surface text-right">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
