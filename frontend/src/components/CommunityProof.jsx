/**
 * CommunityProof — shows anonymized peer success metrics and
 * activity feed from the cluster/co-op data.
 *
 * Props:
 *   cluster          — cluster activity data from /cluster/activity
 *   locationName     — user's district/region name
 *   businessCategory — user's selected business category
 *   lang             — current language code
 */
import { useState, useEffect } from 'react';

function AnimatedCounter({ target, duration = 1500 }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 30)));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <span>{count}</span>;
}

const CATEGORY_LABELS = {
  dairy: 'Dairy', grocery: 'Grocery', poultry: 'Poultry',
  tailoring: 'Tailoring', pharmacy: 'Pharmacy', restaurant: 'Restaurant',
  bakery: 'Bakery', vegetables: 'Vegetables', hardware: 'Hardware',
  electronics: 'Electronics', clothing: 'Clothing', general_store: 'General Store',
};

export default function CommunityProof({ cluster, locationName, businessCategory, lang = 'en' }) {
  const clusterName = cluster?.cluster_name || locationName || 'Your District';
  // No invented social proof: these render only when the server actually
  // reports them. The old defaults (142 entrepreneurs, a 94% success rate, a
  // peer count derived from them) described a community that did not exist.
  const activeCount = cluster?.active_enterprises ?? null;
  const successRate = cluster?.success_rate ?? null;
  const topCategories = cluster?.top_categories || [];
  const events = cluster?.events || [];

  const catLabel = CATEGORY_LABELS[businessCategory] || (businessCategory || '').replace(/_/g, ' ');
  const peersInCategory = cluster?.peers_in_category ?? null;

  const stats = [
    {
      icon: '👥',
      value: activeCount,
      label: lang === 'hi' ? 'सक्रिय उद्यमी' : lang === 'mr' ? 'सक्रिय उद्योजक' : 'Active Entrepreneurs',
      sub: clusterName,
    },
    {
      icon: '✅',
      value: successRate,
      label: lang === 'hi' ? 'सफलता दर' : lang === 'mr' ? 'यश दर' : 'Success Rate',
      sub: lang === 'hi' ? 'समय पर भुगतान' : lang === 'mr' ? 'वेळेवर भरणा' : 'On-time repayment',
      isText: true,
    },
    {
      icon: '🏪',
      value: peersInCategory,
      label: catLabel || (lang === 'hi' ? 'आपकी श्रेणी' : 'Your Category'),
      sub: lang === 'hi' ? 'समान व्यवसाय' : lang === 'mr' ? 'समान व्यवसाय' : 'Similar businesses',
    },
  ].filter((stat) => stat.value !== null && stat.value !== undefined);

  return (
    <div className="community-proof">
      {/* Headline */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🤝</span>
        <div>
          <h3 className="font-headline-md text-[16px] font-bold text-on-surface">
            {lang === 'hi' ? 'समुदाय की सफलता' : lang === 'mr' ? 'समुदायाची यशोगाथा' : 'Community Success Stories'}
          </h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {lang === 'hi'
              ? `${clusterName} क्षेत्र में आपके जैसे उद्यमी`
              : lang === 'mr'
              ? `${clusterName} भागातील तुमच्यासारखे उद्योजक`
              : `Entrepreneurs like you in ${clusterName}`}
          </p>
        </div>
      </div>

      {stats.length === 0 && events.length === 0 && (
        <p className="font-body-md text-body-md text-on-surface-variant py-4">
          Not enough activity in your cluster yet. As people nearby apply for
          loans and log harvests, their progress will appear here.
        </p>
      )}

      {/* Stat cards */}
      {stats.length > 0 && (
      <div className={`grid gap-3 mb-5 ${stats.length === 3 ? 'grid-cols-3' : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {stats.map((stat, i) => (
          <div key={i} className="p-4 rounded-xl bg-surface-container-low text-center">
            <span className="text-2xl block mb-2">{stat.icon}</span>
            <span className="block font-headline-md text-[22px] font-bold text-on-surface">
              {stat.isText ? stat.value : <AnimatedCounter target={stat.value} />}
            </span>
            <span className="block font-label-sm text-label-sm text-on-surface-variant mt-0.5">{stat.label}</span>
            <span className="block font-label-sm text-[11px] text-primary mt-0.5">{stat.sub}</span>
          </div>
        ))}
      </div>
      )}

      {/* Peer proof banner */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 flex items-start gap-3 mb-4">
        <span className="text-2xl shrink-0">💡</span>
        <p className="font-body-md text-[13px] text-on-surface leading-relaxed">
          {lang === 'hi'
            ? `${clusterName} में ${peersInCategory} अन्य लोगों ने ${catLabel || 'इसी प्रकार का'} व्यवसाय सफलतापूर्वक शुरू किया है। ${successRate} समय पर भुगतान दर!`
            : lang === 'mr'
            ? `${clusterName} मध्ये ${peersInCategory} इतर लोकांनी ${catLabel || 'अशाच प्रकारचा'} व्यवसाय यशस्वीरीत्या सुरू केला आहे. ${successRate} वेळेवर भरणा दर!`
            : `${peersInCategory} other people in ${clusterName} have successfully started ${catLabel || 'similar'} businesses. ${successRate} on-time repayment rate!`}
        </p>
      </div>

      {/* Top Categories */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
          {lang === 'hi' ? 'शीर्ष श्रेणियाँ:' : lang === 'mr' ? 'शीर्ष श्रेणी:' : 'Top Categories:'}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {topCategories.map((cat, i) => (
            <span key={i} className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-[11px] font-semibold">
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Recent activity feed */}
      {events.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
            {lang === 'hi' ? 'हाल की गतिविधि:' : lang === 'mr' ? 'अलीकडील क्रियाकलाप:' : 'Recent Activity:'}
          </span>
          {events.slice(0, 3).map(event => (
            <div key={event.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                event.kind === 'approval' ? 'bg-primary/10' : event.kind === 'harvest' ? 'bg-amber-100' : 'bg-surface-container'
              }`}>
                {event.kind === 'approval' ? '✅' : event.kind === 'harvest' ? '🌾' : event.kind === 'repayment' ? '💸' : '📌'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-sm text-label-sm font-semibold text-on-surface truncate">{event.title}</span>
                <span className="font-label-sm text-[11px] text-on-surface-variant truncate">{event.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
