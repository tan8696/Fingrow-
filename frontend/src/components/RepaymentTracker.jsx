import React, { useState, useEffect, useCallback } from 'react';
import { fetchRepaymentStatus, markRepaymentPaid } from '../hooks/useReport';

function formatINR(num) {
  return '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RepaymentTracker({ loan, onBack, onChanged }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payingMonth, setPayingMonth] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRepaymentStatus(loan.id)
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load repayment status: ' + err.message);
        setLoading(false);
      });
  }, [loan.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkPaid = async (month) => {
    setPayingMonth(month);
    try {
      const updated = await markRepaymentPaid(loan.id, month);
      setStatus(updated);
      showToast(`Instalment ${month} recorded as paid.`);
      if (updated.fully_paid) {
        showToast('🎉 Loan fully repaid — congratulations!');
      }
      onChanged && onChanged();
    } catch (err) {
      console.error(err);
      showToast('Could not record payment: ' + err.message);
    } finally {
      setPayingMonth(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p>Loading repayment schedule...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <button onClick={onBack} className="flex items-center gap-2 mb-6 text-primary hover:underline font-label-lg text-label-lg">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Loan History
        </button>
        <div className="bg-error-container/20 text-error rounded-2xl px-6 py-10">
          <span className="material-symbols-outlined text-4xl mb-2 block">error</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const progressPct = status.months_total > 0 ? Math.round((status.months_paid / status.months_total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-stack-gap">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-primary hover:underline font-label-lg text-label-lg">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Loan History
        </button>
        <span className={`px-3 py-1 rounded-full font-label-sm text-label-sm ${status.fully_paid ? 'bg-primary-container/20 text-primary' : 'bg-surface-container text-on-surface-variant border border-outline-variant'}`}>
          {status.fully_paid ? 'Fully Repaid' : `Active • ${status.months_paid}/${status.months_total} paid`}
        </span>
      </div>

      <div>
        <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface font-bold">Repayment Tracker</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1 capitalize">
          {loan.name} • {loan.id}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-surface-variant">
          <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Outstanding Principal</p>
          <p className="font-headline-md text-headline-md font-bold text-on-surface">{formatINR(status.outstanding_principal)}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-surface-variant">
          <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Total Paid</p>
          <p className="font-headline-md text-headline-md font-bold text-primary">{formatINR(status.total_paid)}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-surface-variant">
          <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Next Due</p>
          <p className="font-headline-md text-headline-md font-bold text-on-surface">
            {status.fully_paid ? '—' : `#${status.next_due_month}`}
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">{status.fully_paid ? 'Nothing due' : formatDate(status.next_due_date)}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-surface-variant">
          <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Monthly EMI</p>
          <p className="font-headline-md text-headline-md font-bold text-on-surface">{formatINR(status.monthly_emi)}</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">{status.annual_rate_pct}% p.a. • {status.tenure_months} months</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-variant">
        <div className="flex justify-between items-center mb-3">
          <p className="font-label-lg text-label-lg font-semibold text-on-surface">Repayment Progress</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">{status.months_paid} of {status.months_total} instalments ({progressPct}%)</p>
        </div>
        <div className="w-full bg-surface-container h-4 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${status.fully_paid ? 'bg-primary' : 'bg-primary'}`}
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-variant overflow-hidden">
        <div className="p-6 border-b border-surface-variant bg-surface">
          <h3 className="font-headline-md text-headline-md text-on-surface">Monthly Schedule</h3>
        </div>
        <div className="divide-y divide-surface-variant max-h-[520px] overflow-y-auto">
          {status.schedule.map((entry) => {
            const isNextDue = entry.month === status.next_due_month;
            return (
              <div key={entry.month} className={`p-4 md:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${entry.paid ? 'opacity-75' : ''}`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-label-lg text-label-lg font-bold ${
                    entry.paid ? 'bg-primary/10 text-primary' : isNextDue ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    {entry.paid ? '✓' : entry.month}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-label-lg text-label-lg font-semibold text-on-surface">Instalment {entry.month}</p>
                      {entry.paid ? (
                        <span className="px-2 py-0.5 bg-primary-container/20 text-primary rounded-full text-xs font-semibold">Paid {formatDate(entry.paid_on)}</span>
                      ) : isNextDue ? (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-semibold">Next Due</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-xs font-semibold">Upcoming</span>
                      )}
                    </div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                      {formatDate(entry.payment_date)} • Principal {formatINR(entry.principal)} + Interest {formatINR(entry.interest)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="text-right">
                    <p className="font-label-lg text-label-lg font-bold text-on-surface">{formatINR(entry.total_payment)}</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">Balance {formatINR(entry.closing_balance)}</p>
                  </div>
                  {isNextDue && !status.fully_paid && (
                    <button
                      onClick={() => handleMarkPaid(entry.month)}
                      disabled={payingMonth === entry.month}
                      className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-lg transition-shadow disabled:opacity-60 whitespace-nowrap"
                    >
                      {payingMonth === entry.month ? (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                      )}
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fully repaid banner */}
      {status.fully_paid && (
        <div className="bg-primary-container/10 border-2 border-primary/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h4 className="font-headline-md text-headline-md font-bold text-on-surface">Loan Fully Repaid!</h4>
            <p className="font-body-md text-body-md text-on-surface-variant">All {status.months_total} instalments settled. Your loan account is now closed.</p>
          </div>
          <button onClick={onBack} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-lg transition-shadow whitespace-nowrap">
            Back to Loan History
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-on-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-xl font-label-lg text-label-lg flex items-center gap-2 animate-in">
          <span className="material-symbols-outlined text-sm">info</span>
          {toast}
        </div>
      )}
    </div>
  );
}