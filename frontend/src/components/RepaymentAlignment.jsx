import React from 'react';

/**
 * RepaymentAlignment — the repayment schedule drawn against the months the
 * business actually earns in.
 *
 * The point is the collisions: an instalment falling in a month with no
 * harvest income is where an otherwise viable loan starts to go wrong, and
 * nothing else in the app shows that.
 */

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function inr(n) {
  const num = Number(n || 0);
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

export default function RepaymentAlignment({ alignment }) {
  if (!alignment) return null;

  const {
    income_months = [],
    instalments = [],
    at_risk_count = 0,
    at_risk_amount = 0,
    steady_income,
    pattern_note,
    summary,
    recommendation,
    business_category,
  } = alignment;

  const incomeSet = new Set(income_months);

  // Count instalments per calendar month so a 7-year schedule stays one row.
  const perMonth = SHORT.map((_, i) => {
    const month = i + 1;
    const rows = instalments.filter((p) => p.due_month === month && !p.payment_type.includes('Moratorium'));
    return {
      month,
      count: rows.length,
      amount: rows.reduce((sum, r) => sum + (r.total_payment || 0), 0),
      hasIncome: incomeSet.has(month),
    };
  });

  const maxCount = Math.max(1, ...perMonth.map((m) => m.count));

  return (
    <section className="bg-surface-container-lowest rounded-3xl shadow-sm overflow-hidden mb-8">
      <header className="flex items-start gap-3 p-card-padding-mobile md:p-card-padding-desktop border-b border-outline-variant">
        <div className="w-11 h-11 rounded-2xl bg-tertiary-container/30 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-tertiary-container">calendar_month</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-headline-md text-headline-md text-on-surface">Repayment vs. earning months</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{summary}</p>
          {pattern_note && (
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-1 opacity-80">{pattern_note}</p>
          )}
        </div>
      </header>

      <div className="p-card-padding-mobile md:p-card-padding-desktop space-y-6">
        {/* Month strip: bar height = instalments due, colour = does income arrive */}
        <div>
          <div className="flex gap-1 sm:gap-2 items-end h-28">
            {perMonth.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                {m.count > 0 && (
                  <span className="font-label-sm text-label-sm text-on-surface-variant">{m.count}</span>
                )}
                <div
                  className={`w-full rounded-t-md transition-all ${
                    m.count === 0
                      ? 'bg-surface-variant'
                      : m.hasIncome
                        ? 'bg-primary'
                        : 'bg-error'
                  }`}
                  style={{ height: m.count === 0 ? '4px' : `${Math.max(16, (m.count / maxCount) * 80)}px` }}
                  title={
                    m.count === 0
                      ? `${SHORT[m.month - 1]}: no instalments`
                      : `${SHORT[m.month - 1]}: ${m.count} instalment(s), ${inr(m.amount)}${
                          m.hasIncome ? '' : ' — no income this month'
                        }`
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1 sm:gap-2 mt-2">
            {perMonth.map((m) => (
              <div key={m.month} className="flex-1 text-center min-w-0">
                <span
                  className={`font-label-sm text-label-sm ${
                    m.hasIncome ? 'text-primary font-semibold' : 'text-on-surface-variant'
                  }`}
                >
                  {SHORT[m.month - 1]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 font-label-md text-label-md text-on-surface-variant">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-primary" /> Instalment in an earning month
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-error" /> Instalment with no income due
          </span>
        </div>

        {steady_income ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {String(business_category || 'This business').replace(/_/g, ' ')} earns through the year,
            so instalments do not need to be timed to a harvest.
          </p>
        ) : (
          at_risk_count > 0 && (
            <div className="p-4 rounded-2xl bg-error-container/20 text-on-error-container">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined">warning</span>
                <div>
                  <p className="font-label-lg text-label-lg">
                    {at_risk_count} instalments worth {inr(at_risk_amount)} fall in months with no income
                  </p>
                  <p className="font-body-md text-body-md opacity-90 mt-1">
                    These are the months the household will need to have set money aside, or borrow again to cover.
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        {recommendation && (
          <div className="p-4 rounded-2xl bg-primary-container/25 text-on-primary-container">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined">lightbulb</span>
              <div>
                <p className="font-label-lg text-label-lg">
                  Ask for a {recommendation.suggested_moratorium_months}-month moratorium
                  {' '}(scheme offers {recommendation.current_moratorium_months})
                </p>
                <p className="font-body-md text-body-md opacity-90 mt-1">{recommendation.reason}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
