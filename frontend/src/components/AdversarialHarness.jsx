import React from 'react';
import MarketReport from './MarketReport';
import AmortizationTable from './AmortizationTable';

const mockT = {
  marketIntel: "Market Intelligence",
  marketReach: "Market Reach",
  opportunity: "Opportunity Analysis",
  competitors: "Competitor Analysis",
  swot: "SWOT Analysis",
  strengths: "Strengths",
  weaknesses: "Weaknesses",
  opportunities: "Opportunities",
  threats_swot: "Threats",
  threats: "Local Threats",
  pricing: "Pricing Strategy",
  repayment: "Repayment Schedule",
  quarterlyEMI: "Quarterly EMI",
  totalInterest: "Total Interest",
  totalPaid: "Total Paid",
  quarter: "Quarter",
  type: "Payment Type",
  opening: "Opening",
  principal: "Principal",
  interest: "Interest",
  payment: "Payment",
  closing: "Closing"
};

const edgeCaseReport = {
  market_reach: "Highly localized reach but zero physical competitors mapped.",
  opportunity_analysis: "First-mover advantage in this sector due to missing OSM data.",
  competitor_mapping: "No competitors found within 5km radius.",
  swot: {
    strengths: ["Unique proposition"],
    weaknesses: [], 
    opportunities: ["Untapped market"],
    threats: ["Data sparsity"]
  },
  hyper_local_threats: ["Supplier unreliability due to remote location"],
  pricing_strategy: "Aggressive pricing due to zero competition."
};

const edgeCaseOsmSummary = null;

const edgeCaseAmortization = {
  schedule: [
    { quarter: 1, payment_type: "Moratorium", opening_balance: 140000, principal: 0, interest: 3500, total_payment: 3500, closing_balance: 140000 },
    { quarter: 2, payment_type: "EMI", opening_balance: 140000, principal: 11000, interest: 3500, total_payment: 14500, closing_balance: 129000 }
  ],
  quarterly_emi: 14500,
  total_interest_paid: 7000,
  total_amount_paid: 147000,
  moratorium_months: 3
};

export default function AdversarialHarness() {
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <h1 className="text-3xl font-bold mb-8 text-red-600 border-b-2 border-slate-900 pb-2">
        Adversarial Test Harness
      </h1>
      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold mb-4">Market Report (Missing OSM Data)</h2>
          <div className="bg-white p-4 border border-slate-300">
            <MarketReport report={edgeCaseReport} osm_summary={edgeCaseOsmSummary} t={mockT} />
          </div>
        </section>
        <section>
          <h2 className="text-2xl font-bold mb-4">Amortization Table (1.40L Boundary)</h2>
          <div className="bg-white p-4 border border-slate-300">
            <AmortizationTable amortization={edgeCaseAmortization} t={mockT} />
          </div>
        </section>
      </div>
    </div>
  );
}
