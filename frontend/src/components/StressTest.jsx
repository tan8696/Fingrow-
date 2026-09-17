import React, { useState } from 'react';
import { runStressTest } from '../hooks/useReport';

/**
 * StressTest — the case against the recommendation.
 *
 * Every other panel in this report explains why the business could work. This
 * one asks what would make it fail, against the same figures. A borrower who is
 * told plainly that the numbers do not hold has been served better than one
 * congratulated into a default.
 */

const VERDICTS = {
  proceed: {
    icon: 'check_circle',
    label: 'Holds up',
    tone: 'bg-primary-container/25 text-on-primary-container',
  },
  proceed_with_changes: {
    icon: 'edit_note',
    label: 'Workable, with changes',
    tone: 'bg-tertiary-container/25 text-on-tertiary-container',
  },
  reconsider: {
    icon: 'report',
    label: 'Reconsider this plan',
    tone: 'bg-error-container/25 text-on-error-container',
  },
};

const SEVERITY = {
  high: { label: 'High', chip: 'bg-error-container/30 text-on-error-container', bar: 'bg-error' },
  medium: { label: 'Medium', chip: 'bg-tertiary-container/30 text-on-tertiary-container', bar: 'bg-tertiary' },
  low: { label: 'Low', chip: 'bg-surface-container-high text-on-surface-variant', bar: 'bg-outline' },
};

export default function StressTest({ sessionId, expectedAnnualIncome }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  if (!sessionId) return null;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runStressTest(sessionId, expectedAnnualIncome));
    } catch (err) {
      setError(
        err?.status === 503
          ? 'The advisory model is not configured on this server, so the stress test cannot run.'
          : 'Could not run the stress test. Check the connection and try again.'
      );
    } finally {
      setRunning(false);
    }
  };

  const verdict = result ? VERDICTS[result.verdict] || VERDICTS.proceed_with_changes : null;

  return (
    <section className="bg-surface-container-lowest rounded-3xl shadow-sm overflow-hidden mb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 p-card-padding-mobile md:p-card-padding-desktop border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-error-container/25 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-error-container">gavel</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Stress test</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              The case against this plan, using the same figures.
            </p>
          </div>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-on-surface text-surface font-label-lg text-label-lg disabled:opacity-60 transition-opacity"
        >
          <span className={`material-symbols-outlined text-[20px] ${running ? 'animate-spin' : ''}`}>
            {running ? 'progress_activity' : 'bolt'}
          </span>
          {running ? 'Arguing against it…' : result ? 'Run again' : 'Argue against this plan'}
        </button>
      </header>

      {error && (
        <div className="m-card-padding-mobile md:m-card-padding-desktop p-4 rounded-2xl bg-error-container/20 text-on-error-container">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined">error</span>
            <p className="font-body-md text-body-md">{error}</p>
          </div>
        </div>
      )}

      {!result && !error && !running && (
        <p className="p-card-padding-mobile md:p-card-padding-desktop font-body-md text-body-md text-on-surface-variant">
          Nothing here has argued against the recommendation yet. Run this before
          you sign anything — it is cheaper to find the weak points now.
        </p>
      )}

      {result && (
        <div className="p-card-padding-mobile md:p-card-padding-desktop space-y-6">
          <div className={`p-5 rounded-2xl ${verdict.tone}`}>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[28px]">{verdict.icon}</span>
              <div className="min-w-0">
                <p className="font-label-lg text-label-lg uppercase tracking-wide opacity-80">{verdict.label}</p>
                <p className="font-headline-md text-headline-md mt-1">{result.headline}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {(result.failure_modes || []).map((mode, i) => {
              const sev = SEVERITY[mode.severity] || SEVERITY.low;
              return (
                <article key={i} className="flex gap-4">
                  <div className={`w-1 rounded-full shrink-0 ${sev.bar}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="font-label-lg text-label-lg text-on-surface">{mode.risk}</h4>
                      <span className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${sev.chip}`}>
                        {sev.label}
                      </span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant">{mode.mechanism}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 opacity-80">
                      <span className="material-symbols-outlined text-[14px] align-middle mr-1">data_object</span>
                      Based on: {mode.evidence}
                    </p>
                    {mode.mitigation && (
                      <p className="font-body-md text-body-md text-on-surface mt-2 px-3 py-2 rounded-xl bg-surface-container-low">
                        <span className="material-symbols-outlined text-[16px] align-middle mr-1 text-primary">
                          arrow_forward
                        </span>
                        {mode.mitigation}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {result.what_would_have_to_be_true?.length > 0 && (
            <div>
              <h4 className="font-label-lg text-label-lg text-on-surface mb-2">
                Check these yourself before you borrow
              </h4>
              <ul className="space-y-2">
                {result.what_would_have_to_be_true.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 font-body-md text-body-md text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">
                      check_box_outline_blank
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.break_even_pressure && (
            <div className="p-4 rounded-2xl bg-surface-container-low">
              <p className="font-label-md text-label-md text-on-surface mb-1">Where the schedule is tightest</p>
              <p className="font-body-md text-body-md text-on-surface-variant">{result.break_even_pressure}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
