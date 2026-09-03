import React, { useState, useEffect, useCallback } from 'react';
import { approveLoanApplication, fetchLoanHistory, fetchLoanStatement } from '../hooks/useReport';
import RepaymentTracker from './RepaymentTracker';

const filterOptions = ['All', 'Active', 'Pending', 'Repaid'];

export default function LoanHistory({ onNavigate }) {
  const [loansData, setLoansData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [officerMode, setOfficerMode] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [trackingLoan, setTrackingLoan] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadLoans = useCallback(() => {
    setLoading(true);
    fetchLoanHistory()
      .then(data => {
        setLoansData(data.loans || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load loan history.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadLoans();
  }, [loadLoans]);

  const cycleFilter = () => {
    const currentIndex = filterOptions.indexOf(filter);
    setFilter(filterOptions[(currentIndex + 1) % filterOptions.length]);
  };

  const downloadClientSideFallback = (loan) => {
    // Legacy demo loans have no backend schedule; render a short mock statement.
    const rows = [
      ['Loan Statement — ' + loan.name],
      ['Loan ID', loan.id],
      ['Status', loan.status],
      [loan.dateLabel || 'Date', loan.date],
      ['Amount', '₹' + Number(loan.amount || 0).toLocaleString('en-IN')],
      [],
      ['Date', 'Description', 'Amount (INR)'],
    ];
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - i);
      rows.push([d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 'EMI Payment', Math.round(loan.amount / 10)]);
    }
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement_${loan.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Statement downloaded for ' + loan.id + '.');
  };

  const downloadStatement = async (loan) => {
    if (loan.statement_available && loan.source === 'application') {
      try {
        const blob = await fetchLoanStatement(loan.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `loan_statement_${loan.id}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Repayment statement downloaded for ' + loan.id + '.');
      } catch (err) {
        console.error(err);
        showToast('Statement download failed: ' + err.message);
      }
    } else {
      downloadClientSideFallback(loan);
    }
  };

  const handleApprove = async (loan) => {
    setApprovingId(loan.id);
    try {
      const approved = await approveLoanApplication(loan.id);
      showToast(`Loan ${approved.id} approved — EMI ₹${Number(approved.monthly_emi || 0).toLocaleString('en-IN')}/month.`);
      loadLoans();
    } catch (err) {
      console.error(err);
      showToast('Approval failed: ' + err.message);
    } finally {
      setApprovingId(null);
    }
  };

  if (trackingLoan) {
    return (
      <RepaymentTracker
        loan={trackingLoan}
        onBack={() => setTrackingLoan(null)}
        onChanged={() => loadLoans()}
      />
    );
  }

  const filteredLoans = loansData.filter(loan => filter === 'All' || loan.status === filter);

  const pendingApplications = loansData.filter(l => l.source === 'application' && l.status === 'Pending');

  const activeLoans = loansData.filter(l => l.status === 'Active');
  const activeTotal = activeLoans.reduce((sum, l) => sum + (l.amount || 0), 0);

  const repaidLoans = loansData.filter(l => l.status === 'Repaid');
  const repaidTotal = repaidLoans.reduce((sum, l) => sum + (l.amount || 0), 0);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p>Loading loan history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center text-error bg-error-container/20 rounded-2xl">
        <span className="material-symbols-outlined text-4xl mb-2">error</span>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-stack-gap">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background">Loan History</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Review your past and current financing.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={() => setOfficerMode(m => !m)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl min-h-[48px] font-label-lg text-label-lg transition-all border ${
              officerMode
                ? 'bg-primary-container text-on-primary-container border-primary-container shadow-sm'
                : 'bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-container'
            }`}
            title="Toggle bank officer view"
          >
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
            <span className="hidden sm:inline">Officer View</span>
            {pendingApplications.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${officerMode ? 'bg-on-primary-container/20' : 'bg-primary text-on-primary'}`}>
                {pendingApplications.length}
              </span>
            )}
          </button>
          <button
            onClick={() => onNavigate && onNavigate('feasibility')}
            className="flex-1 md:flex-none bg-primary text-on-primary font-label-lg text-label-lg px-6 py-3 rounded-xl min-h-[48px] hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm hover:shadow-xl flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span className="hidden sm:inline">Apply for Loan</span>
            <span className="sm:hidden">Apply</span>
          </button>
        </div>
      </div>

      {/* Officer mode banner */}
      {officerMode && (
        <div className="bg-tertiary-container/10 border border-tertiary/30 text-on-surface rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-in">
          <span className="material-symbols-outlined text-tertiary">verified_user</span>
          <div className="flex-1">
            <p className="font-label-lg text-label-lg font-semibold text-on-surface">Bank Officer Mode — {pendingApplications.length} application{pendingApplications.length === 1 ? '' : 's'} awaiting approval</p>
            <p className="font-body-md text-body-md text-on-surface-variant text-sm">
              Approving a loan sanctions the requested amount under its scheme terms and generates a monthly EMI statement.
            </p>
          </div>
        </div>
      )}

      {/* Summary Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-gap">
        {/* Active Loans Card */}
        <div className="bg-surface-container-lowest p-card-padding-mobile md:p-card-padding-desktop rounded-2xl shadow-sm hover:shadow-xl transition-shadow border border-surface-variant">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary-container/20 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container text-2xl">account_balance_wallet</span>
            </div>
            <span className="bg-primary-container/10 text-primary-container font-label-sm text-label-sm px-3 py-1 rounded-full">Current</span>
          </div>
          <p className="font-label-lg text-label-lg text-on-surface-variant mb-1">Total Monthly EMI Commitment</p>
          <h3 className="font-display-lg text-display-lg text-on-background">₹{activeTotal.toLocaleString('en-IN')}</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2 text-sm">Across {activeLoans.length} active accounts</p>
        </div>

        {/* Repaid Loans Card */}
        <div className="bg-surface-container-lowest p-card-padding-mobile md:p-card-padding-desktop rounded-2xl shadow-sm hover:shadow-xl transition-shadow border border-surface-variant">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-surface-container-high rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-2xl">task_alt</span>
            </div>
            <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-3 py-1 rounded-full">Historical</span>
          </div>
          <p className="font-label-lg text-label-lg text-on-surface-variant mb-1">Total Repaid</p>
          <h3 className="font-display-lg text-display-lg text-on-background">₹{repaidTotal.toLocaleString('en-IN')}</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2 text-sm">Successfully completed</p>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-variant overflow-hidden">
        <div className="p-6 border-b border-surface-variant flex justify-between items-center bg-surface">
          <div className="flex items-center gap-4">
            <h3 className="font-headline-md text-headline-md text-on-background">Detailed History</h3>
            {filter !== 'All' && (
              <span className="bg-surface-variant text-on-surface-variant text-xs px-2 py-0.5 rounded-full font-medium">
                {filter}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={cycleFilter}
              className={`p-2 rounded-lg transition-colors ${filter !== 'All' ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-variant text-on-surface-variant'}`}
              title={`Filter: ${filter}`}
            >
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </div>
        <div className="divide-y divide-surface-variant">
          {filteredLoans.map((loan) => {
            const isPendingApp = loan.source === 'application' && loan.status === 'Pending';
            const canApprove = officerMode && isPendingApp;
            return (
              <div key={loan.id} className={`p-4 md:p-6 hover:bg-surface-bright transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${loan.status === 'Repaid' ? 'opacity-75' : ''}`}>
                <div className="flex items-start gap-4 flex-1">
                  <div className={`w-10 h-10 ${loan.iconBg} rounded-full flex items-center justify-center shrink-0 mt-1`}>
                    <span className={`material-symbols-outlined ${loan.iconColor}`}>{loan.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-label-lg text-label-lg text-on-background">{loan.name}</h4>
                      <span className={`${loan.statusBg} text-xs px-2 py-0.5 rounded-full font-medium`}>{loan.status}</span>
                      {isPendingApp && (
                        <span className="bg-tertiary-container/20 text-tertiary text-xs px-2 py-0.5 rounded-full font-medium">
                          Awaiting approval
                        </span>
                      )}
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant text-sm">ID: {loan.id}</p>
                    <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-1">
                      {loan.dateLabel && `${loan.dateLabel}: `}
                      <span className={loan.dateLabel ? "text-on-background font-medium" : ""}>{loan.date}</span>
                    </p>
                    {loan.status === 'Active' && loan.interest_rate_pct && (
                      <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-1">
                        Sanctioned at {loan.interest_rate_pct}% p.a. for {loan.tenure_months} months
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4 md:w-2/5">
                  {canApprove ? (
                    <button
                      onClick={() => handleApprove(loan)}
                      disabled={approvingId === loan.id}
                      className="flex items-center justify-center gap-2 bg-primary text-on-primary px-5 py-3 rounded-xl min-h-[44px] font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow disabled:opacity-60"
                    >
                      {approvingId === loan.id ? (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">verified_user</span>
                      )}
                      {approvingId === loan.id ? 'Approving...' : 'Approve Loan'}
                    </button>
                  ) : (
                    <>
                      <div className="text-right">
                        <p className="font-label-lg text-label-lg text-on-background">₹{loan.amount.toLocaleString('en-IN')}</p>
                        <p className="font-body-md text-body-md text-on-surface-variant text-sm">{loan.amountLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {loan.status === 'Active' && loan.source === 'application' && (
                          <button
                            onClick={() => setTrackingLoan(loan)}
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-high text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors whitespace-nowrap"
                            title="Track EMIs and mark payments"
                          >
                            <span className="material-symbols-outlined text-sm">monitoring</span>
                            <span className="hidden sm:inline">Track Repayments</span>
                          </button>
                        )}
                        <button
                          aria-label="Download Statement"
                          onClick={() => loan.status !== 'Pending' && downloadStatement(loan)}
                          className={`flex items-center justify-center w-10 h-10 rounded-full border border-outline transition-colors ${loan.status === 'Pending' ? 'opacity-50 cursor-not-allowed text-on-surface-variant' : 'hover:bg-surface-variant text-on-surface-variant'}`}
                          disabled={loan.status === 'Pending'}
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {filteredLoans.length === 0 && (
            <div className="p-8 text-center text-on-surface-variant font-body-lg">
              No loans found for status: {filter}
            </div>
          )}
        </div>
      </div>

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