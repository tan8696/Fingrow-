import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine
} from "recharts";

function formatINR(val) {
  return "₹" + Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const MORATORIUM_COLOR = "#94a3b8"; // slate-400
const EMI_COLOR = "#0f172a"; // slate-900

export default function AmortizationTable({ amortization, t }) {
  const { schedule, quarterly_emi, total_interest_paid, total_amount_paid,
          moratorium_months } = amortization;

  const moratoriumQtrs = moratorium_months / 3;

  // Chart data
  const chartData = schedule?.map((e) => ({
    name: `Q${e.quarter}`,
    payment: e.total_payment,
    isMoratorium: e.payment_type.includes("Moratorium"),
  })) || [];

  return (
    <div className="card">
      <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2 mb-6">
        <div className="text-2xl">📅</div>
        <div>
          <h2 className="text-xl font-bold">{t.repayment}</h2>
          <p className="text-sm text-slate-600">Interest-only during moratorium · Reducing balance EMI thereafter</p>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border-2 border-slate-900 p-4 flex flex-col justify-center items-center bg-slate-50">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-1">{t.quarterlyEMI}</span>
          <span className="text-xl font-mono font-bold text-slate-900">{formatINR(quarterly_emi)}</span>
        </div>
        <div className="border-2 border-slate-900 p-4 flex flex-col justify-center items-center bg-slate-50">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-1">{t.totalInterest}</span>
          <span className="text-xl font-mono font-bold text-slate-900">{formatINR(total_interest_paid)}</span>
        </div>
        <div className="border-2 border-slate-900 p-4 flex flex-col justify-center items-center bg-slate-900 text-white">
          <span className="text-sm font-bold uppercase tracking-wider mb-1">{t.totalPaid}</span>
          <span className="text-xl font-mono font-bold">{formatINR(total_amount_paid)}</span>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="h-64 mb-6 border-2 border-slate-900 p-4 pt-8">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#0f172a', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} tick={{ fill: '#0f172a', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip 
              formatter={(val) => formatINR(val)}
              contentStyle={{ border: '2px solid #0f172a', borderRadius: '0', boxShadow: 'none' }} 
            />
            <ReferenceLine
              x={`Q${moratoriumQtrs}`}
              stroke="#0f172a"
              strokeDasharray="4 2"
              label={{ value: "EMI Starts", position: "insideTopRight", fill: "#0f172a", fontSize: 10, fontWeight: 'bold' }}
            />
            <Bar dataKey="payment" radius={[0, 0, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isMoratorium ? MORATORIUM_COLOR : EMI_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 justify-center mt-2 text-xs font-bold uppercase tracking-wide">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-slate-400 border border-slate-900"></div> Moratorium
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-slate-900"></div> EMI
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="border-2 border-slate-900 overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
          <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider text-xs">
            <tr>
              <th className="p-3 border-r border-slate-700">{t.quarter}</th>
              <th className="p-3 border-r border-slate-700">{t.type}</th>
              <th className="p-3 border-r border-slate-700 text-right">{t.opening}</th>
              <th className="p-3 border-r border-slate-700 text-right">{t.principal}</th>
              <th className="p-3 border-r border-slate-700 text-right">{t.interest}</th>
              <th className="p-3 border-r border-slate-700 text-right bg-slate-800">{t.payment}</th>
              <th className="p-3 text-right">{t.closing}</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-900">
            {schedule?.map((entry) => (
              <tr
                key={entry.quarter}
                className={`border-b border-slate-300 ${entry.payment_type.includes("Moratorium") ? "bg-slate-100" : "bg-white"}`}
              >
                <td className="p-3 border-r border-slate-300 font-sans font-bold">{entry.quarter}</td>
                <td className="p-3 border-r border-slate-300 text-xs uppercase tracking-wide font-sans font-bold">
                  {entry.payment_type.includes("Moratorium") ? "Moratorium" : "EMI"}
                </td>
                <td className="p-3 border-r border-slate-300 text-right">{formatINR(entry.opening_balance)}</td>
                <td className="p-3 border-r border-slate-300 text-right">{formatINR(entry.principal)}</td>
                <td className="p-3 border-r border-slate-300 text-right">{formatINR(entry.interest)}</td>
                <td className="p-3 border-r border-slate-300 text-right font-bold bg-slate-50">{formatINR(entry.total_payment)}</td>
                <td className="p-3 text-right">{formatINR(entry.closing_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
