/**
 * SubsidyMatcher — client-side government scheme eligibility engine.
 * Matches user demographics (gender, social category, state) and
 * financial profile (project cost, business category) against a
 * hardcoded database of Indian govt schemes for micro-entrepreneurs.
 *
 * Props:
 *   userProfile      — { type, gender, socialCategory }
 *   projectCost      — estimated project cost (number)
 *   businessCategory — selected category string
 *   state            — user's state (optional)
 */

const SCHEMES = [
  // ---------------------------------------------
  // Traditional Artisans & Street Vendors
  // ---------------------------------------------
  {
    id: 'pm_svanidhi',
    name: 'PM-SVANidhi (AtmaNirbhar Nidhi)',
    agency: 'Ministry of Housing and Urban Affairs',
    benefit: 'Collateral-free working capital up to ₹50,000 for street vendors',
    maxCost: 50000,
    eligibility: { categories: 'all' },
    classification: 'Traditional Artisans & Street Vendors',
    icon: '🛒',
  },
  {
    id: 'pm_vishwakarma',
    name: 'PM Vishwakarma Yojana',
    agency: 'Ministry of MSME',
    benefit: 'Subsidized loans up to ₹3 Lakh at 5% interest & skills training',
    maxCost: 300000,
    eligibility: { categories: 'all' }, // Usually traditional trades
    classification: 'Traditional Artisans & Street Vendors',
    icon: '🔨',
  },
  // ---------------------------------------------
  // Agriculture & Food Processing
  // ---------------------------------------------
  {
    id: 'pmfme',
    name: 'PM FME (Formalisation of Micro Food Enterprises)',
    agency: 'Ministry of Food Processing',
    benefit: 'Credit-linked subsidy of 35% of project cost (max ₹10 Lakh)',
    maxCost: 1000000,
    eligibility: { categories: ['restaurant', 'bakery', 'flour_mill', 'dairy', 'vegetables'] },
    classification: 'Agriculture & Food Processing',
    icon: '🍲',
  },
  {
    id: 'acabc',
    name: 'Agri-Clinics and Agri-Business Centres (ACABC)',
    agency: 'Ministry of Agriculture & Farmers Welfare',
    benefit: '36% to 44% subsidy for agri-graduates setting up clinics',
    maxCost: 2000000, // typically higher but keeping it reasonable
    eligibility: { categories: ['agri_clinic', 'dairy', 'farming'] },
    classification: 'Agriculture & Food Processing',
    icon: '🚜',
  },
  {
    id: 'nlm',
    name: 'National Livestock Mission (NLM)',
    agency: 'Dept of Animal Husbandry & Dairying',
    benefit: '50% capital subsidy (up to ₹50 Lakh) for poultry, sheep, goat, pig',
    eligibility: { categories: ['dairy', 'farming', 'poultry'] },
    classification: 'Agriculture & Food Processing',
    icon: '🐄',
  },
  // ---------------------------------------------
  // Women & Marginalised Groups
  // ---------------------------------------------
  {
    id: 'standup',
    name: 'Stand-Up India',
    agency: 'All Scheduled Commercial Banks',
    benefit: 'Loans ₹10 Lakh to ₹1 Cr. Each bank branch must fund at least 1 SC/ST and 1 Woman entrepreneur.',
    maxCost: 10000000,
    minCost: 1000000,
    eligibility: { genders: ['female'], socialCategories: ['sc_st'] },
    classification: 'Women & Marginalised Groups',
    icon: '💪',
  },
  {
    id: 'wcd',
    name: 'Mahila Udyam Nidhi (WCD)',
    agency: 'SIDBI / State Women Development Corp.',
    benefit: 'Soft loans up to ₹10 Lakh at concessional rates for women entrepreneurs',
    maxCost: 1000000,
    eligibility: { genders: ['female'] },
    classification: 'Women & Marginalised Groups',
    icon: '👩‍💼',
  },
  {
    id: 'udyogini',
    name: 'Udyogini Scheme',
    agency: 'Women Development Corporation',
    benefit: 'Interest-free loans up to ₹3 Lakh for women (family income limit applies)',
    maxCost: 300000,
    eligibility: { genders: ['female'] },
    classification: 'Women & Marginalised Groups',
    icon: '🌸',
  },
  {
    id: 'deds',
    name: 'Dr. Ambedkar EDP Scheme (DEDS)',
    agency: 'NBCFDC / Ministry of Social Justice',
    benefit: 'Interest subsidy and skills training for SC/ST entrepreneurs',
    eligibility: { socialCategories: ['sc_st'] },
    classification: 'Women & Marginalised Groups',
    icon: '📚',
  },
  // ---------------------------------------------
  // General Micro & Small Business
  // ---------------------------------------------
  {
    id: 'mudra_shishu',
    name: 'MUDRA Yojana — Shishu',
    agency: 'Any Bank / NBFC',
    benefit: 'Loans up to ₹50,000 without collateral for micro businesses',
    maxCost: 50000,
    eligibility: { categories: 'all' },
    classification: 'General Micro & Small Business',
    icon: '🌱',
  },
  {
    id: 'mudra_kishore',
    name: 'MUDRA Yojana — Kishore',
    agency: 'Any Bank / NBFC',
    benefit: 'Loans ₹50,001 to ₹5,00,000 for growing businesses',
    maxCost: 500000,
    minCost: 50001,
    eligibility: { categories: 'all' },
    classification: 'General Micro & Small Business',
    icon: '🌿',
  },
  {
    id: 'mudra_tarun',
    name: 'MUDRA Yojana — Tarun',
    agency: 'Any Bank / NBFC',
    benefit: 'Loans ₹5,00,001 to ₹10,00,000 for established businesses',
    maxCost: 1000000,
    minCost: 500001,
    eligibility: { categories: 'all' },
    classification: 'General Micro & Small Business',
    icon: '🌳',
  },
  {
    id: 'cgtmse',
    name: 'CGTMSE (Credit Guarantee Fund)',
    agency: 'SIDBI + Government of India',
    benefit: 'Collateral-free loans up to ₹5 Cr with govt guarantee — no property needed!',
    maxCost: 50000000,
    eligibility: { categories: 'all' },
    classification: 'General Micro & Small Business',
    icon: '🛡️',
  },
  // ---------------------------------------------
  // Rural & Youth Startups
  // ---------------------------------------------
  {
    id: 'pmegp',
    name: 'PMEGP (Prime Minister Employment Generation Programme)',
    agency: 'KVIC / District Office',
    benefit: 'Up to 35% subsidy on project cost for rural areas',
    maxCost: 2500000,
    eligibility: { minAge: 18, categories: 'all' },
    bonusFor: ['sc_st', 'women', 'obc'],
    bonusNote: 'SC/ST, Women & OBC get 35% in rural (vs 25% for General)',
    classification: 'Rural & Youth Startups',
    icon: '🏛️',
  },
  {
    id: 'svep',
    name: 'NRLM-SVEP (Start-up Village Entrepreneurship)',
    agency: 'Ministry of Rural Development',
    benefit: 'Enterprise support + CIF funding for SHG members in rural areas',
    eligibility: { categories: 'all' },
    bonusFor: ['women'],
    classification: 'Rural & Youth Startups',
    icon: '🏘️',
  },
  {
    id: 'msy_up',
    name: 'Mukhyamantri Yuva Swarozgar Yojana (UP)',
    agency: 'Govt. of Uttar Pradesh',
    benefit: '25% margin money subsidy (max ₹6.25 Lakh) for youth 18-40 years',
    maxCost: 2500000,
    eligibility: { states: ['up', 'uttar pradesh'] },
    classification: 'Rural & Youth Startups',
    icon: '🏗️',
  },
  {
    id: 'cmegp_mh',
    name: 'CMEGP (Maharashtra)',
    agency: 'Govt. of Maharashtra (DIC)',
    benefit: '35% subsidy for SC/ST/Women in rural areas, 25% for general category',
    maxCost: 5000000,
    eligibility: { states: ['mh', 'maharashtra'] },
    bonusFor: ['sc_st', 'women'],
    classification: 'Rural & Youth Startups',
    icon: '🌺',
  },
];

function matchSchemes({ projectCost, businessCategory, gender, socialCategory, state }) {
  const cost = projectCost || 0;
  const cat = (businessCategory || '').toLowerCase();
  const gen = (gender || '').toLowerCase();
  const sc = (socialCategory || '').toLowerCase();
  const st = (state || '').toLowerCase();

  return SCHEMES.filter(scheme => {
    // Cost range
    if (scheme.maxCost && cost > scheme.maxCost) return false;
    if (scheme.minCost && cost < scheme.minCost) return false;

    // Gender restriction
    if (scheme.eligibility.genders) {
      if (!scheme.eligibility.genders.includes(gen) && !scheme.eligibility.genders.includes('all')) {
        // Stand-Up India also allows SC/ST of any gender
        if (scheme.eligibility.socialCategories?.includes(sc)) {
          // OK — eligible via social category
        } else {
          return false;
        }
      }
    }

    // Social category restriction
    if (scheme.eligibility.socialCategories) {
      if (!scheme.eligibility.socialCategories.includes(sc)) {
        // Also check if eligible via gender
        if (scheme.eligibility.genders?.includes(gen)) {
          // OK — eligible via gender
        } else {
          return false;
        }
      }
    }

    // Business category restriction
    if (scheme.eligibility.categories && scheme.eligibility.categories !== 'all') {
      if (!scheme.eligibility.categories.includes(cat)) return false;
    }

    // State restriction
    if (scheme.eligibility.states) {
      if (!scheme.eligibility.states.some(s => st.includes(s))) return false;
    }

    return true;
  }).map(scheme => {
    // Add bonus tag if applicable
    const bonusTags = [];
    if (scheme.bonusFor?.includes(sc)) bonusTags.push('Extra benefit for your category');
    if (scheme.bonusFor?.includes('women') && gen === 'female') bonusTags.push('Women entrepreneur bonus');
    return { ...scheme, bonusTags };
  });
}

export default function SubsidyMatcher({ userProfile, projectCost, businessCategory, state }) {
  const gender = userProfile?.gender || '';
  const socialCategory = userProfile?.socialCategory || '';

  const matched = matchSchemes({
    projectCost: projectCost || 500000,
    businessCategory,
    gender,
    socialCategory,
    state: state || '',
  });

  if (matched.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-surface-container-low text-center">
        <span className="text-4xl block mb-3">📋</span>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Complete your profile (gender & category) in Settings to see eligible government schemes.
        </p>
      </div>
    );
  }

  // Group matched schemes by classification
  const groupedSchemes = matched.reduce((acc, scheme) => {
    const group = scheme.classification || 'Other Schemes';
    if (!acc[group]) acc[group] = [];
    acc[group].push(scheme);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🎯</span>
        <h3 className="font-headline-md text-[16px] font-bold text-on-surface">
          {matched.length} Scheme{matched.length > 1 ? 's' : ''} You May Be Eligible For
        </h3>
      </div>

      <div className="space-y-6">
        {Object.entries(groupedSchemes).map(([category, schemes]) => (
          <div key={category} className="space-y-3">
            <h4 className="font-label-lg text-label-lg font-semibold text-primary border-b border-surface-variant pb-1">
              {category}
            </h4>
            {schemes.map(scheme => (
              <div
                key={scheme.id}
                className="p-4 rounded-xl bg-surface-container-lowest border border-surface-variant hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{scheme.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-lg text-label-lg font-bold text-on-surface">{scheme.name}</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{scheme.agency}</p>
                    <p className="font-body-md text-[13px] text-on-surface mt-2">{scheme.benefit}</p>
                    {scheme.bonusNote && (
                      <p className="font-label-sm text-[12px] text-primary mt-1.5 flex items-start gap-1">
                        <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">star</span>
                        {scheme.bonusNote}
                      </p>
                    )}
                    {scheme.bonusTags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {scheme.bonusTags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-label-sm text-[11px] font-semibold">
                            ✨ {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export { matchSchemes, SCHEMES };
