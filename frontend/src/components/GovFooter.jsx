import React from 'react';

/**
 * The footer Indian government portals share: link columns, a content-ownership
 * line, a last-reviewed date and the standards the site claims to meet.
 *
 * The ownership line names this as a Smart India Hackathon submission rather
 * than borrowing a department's name.
 */

const COLUMNS = [
  {
    title: 'Schemes',
    links: ['Micro Finance Scheme', 'Term Loan Scheme', 'Capital Subsidy', 'PMFBY Crop Insurance'],
  },
  {
    title: 'Services',
    links: ['Feasibility Report', 'EMI Calculator', 'Mandi Prices', 'Weather & Crop Risk'],
  },
  {
    title: 'Help',
    links: ['How to Apply', 'Required Documents', 'Grievance Redressal', 'Frequently Asked Questions'],
  },
  {
    title: 'Policies',
    links: ['Terms of Use', 'Privacy Policy', 'Accessibility Statement', 'Copyright Policy'],
  },
];

export default function GovFooter() {
  const reviewed = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <footer className="mt-10 border-t-[3px] border-[#ff9933]">
      <div className="bg-[#123a6d] text-white">
        <div className="max-w-[1400px] mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-bold text-[13px] uppercase tracking-wider text-[#ff9933] mb-3">
                {column.title}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link}>
                    <span className="text-[13px] text-white/85 hover:text-white hover:underline cursor-pointer transition-colors">
                      {link}
                    </span>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="bg-[#0d2b52] text-white/80">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between text-[12px]">
          <div className="space-y-1">
            <p>
              Content owned and maintained by the{' '}
              <strong className="text-white">FinGrow project team</strong>, submitted to the
              Smart India Hackathon. Not an official Government of India service.
            </p>
            <p>
              Scheme parameters are illustrative and must be confirmed with the lending
              institution before any application is made.
            </p>
          </div>
          <div className="lg:text-right space-y-1 shrink-0">
            <p>Last reviewed on {reviewed}</p>
            <p className="flex flex-wrap gap-x-3 lg:justify-end">
              <span>GIGW-aligned</span>
              <span aria-hidden="true">·</span>
              <span>WCAG 2.1 AA target</span>
              <span aria-hidden="true">·</span>
              <span>11 languages</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
