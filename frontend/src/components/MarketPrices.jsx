import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchMarketPrices, offlineSampleMandiPrices } from '../hooks/useReport';

export default function MarketPrices() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  const [crops, setCrops] = useState([]);
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [mandi, setMandi] = useState('all');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetchMarketPrices()
      .then(data => {
        if (!isMounted) return;
        const list = data?.crops || data?.prices || [];
        if (list.length > 0) {
          setCrops(list);
          setFeed({ isLive: data?.is_live === true, source: data?.source, at: data?.generated_at });
        } else {
          setCrops(offlineSampleMandiPrices());
          setFeed({ isLive: false, source: 'Offline sample prices — server returned no arrivals' });
        }
        setLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        console.warn('Mandi feed unreachable, showing offline sample:', err);
        setCrops(offlineSampleMandiPrices());
        setFeed({ isLive: false, source: 'Offline sample prices — device is not reaching the server' });
        setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const filteredCrops = useMemo(() => {
    return crops.filter(crop => {
      const matchesSearch = !search.trim() || crop.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'all' || crop.category.toLowerCase().includes(category.toLowerCase());
      const matchesMandi = mandi === 'all' || (crop.mandi && crop.mandi.toLowerCase().includes(mandi.toLowerCase()));
      return matchesSearch && matchesCategory && matchesMandi;
    });
  }, [crops, search, category, mandi]);

  return (
    <div className="max-w-7xl mx-auto space-y-stack-gap">
      {/* Header Section */}
      <div className="mb-stack-gap">
        <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">{t('market_prices.title')}</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant">{t('market_prices.subtitle')}</p>
        {feed && (
          <div
            className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-label-sm text-label-sm ${
              feed.isLive
                ? 'bg-primary-container/20 text-on-primary-container'
                : 'bg-error-container/20 text-on-error-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {feed.isLive ? 'verified' : 'warning'}
            </span>
            <span>{feed.isLive ? 'Live' : 'Demo data'} · {feed.source}</span>
            {feed.at && <span className="opacity-70">· {new Date(feed.at).toLocaleString('en-IN')}</span>}
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-surface-container-lowest p-card-padding-mobile md:p-card-padding-desktop rounded-2xl shadow-sm mb-stack-gap flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input 
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-outline-variant bg-surface-bright text-on-surface focus:ring-2 focus:ring-primary focus:border-primary font-body-md text-body-md transition-shadow min-h-[56px]" 
            placeholder={t('market_prices.search_placeholder')} 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <select 
            className="pl-4 pr-10 py-4 rounded-xl border border-outline-variant bg-surface-bright text-on-surface focus:ring-2 focus:ring-primary font-body-md text-body-md min-h-[56px] min-w-[160px]"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">{t('inline.all_categories')}</option>
            <option value="cereals">{t('inline.cereals')}</option>
            <option value="pulses">{t('inline.pulses')}</option>
            <option value="oilseeds">{t('inline.oilseeds')}</option>
            <option value="cash">{t('inline.cash_crops')}</option>
          </select>
          <select 
            className="pl-4 pr-10 py-4 rounded-xl border border-outline-variant bg-surface-bright text-on-surface focus:ring-2 focus:ring-primary font-body-md text-body-md min-h-[56px] min-w-[160px]"
            value={mandi}
            onChange={(e) => setMandi(e.target.value)}
          >
            <option value="all">{t('inline.all_mandis')}</option>
            <option value="akola">Akola APMC</option>
            <option value="nagpur">Nagpur Mandi</option>
            <option value="rajkot">Rajkot Mandi</option>
            <option value="lasalgaon">Lasalgaon APMC</option>
          </select>
        </div>
      </div>

      {/* Data Grid (Bento Style) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-gap">
        {loading ? (
          <div className="col-span-full py-12 text-center text-on-surface-variant flex flex-col items-center justify-center gap-4">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p>Loading real-time market prices...</p>
          </div>
        ) : error ? (
          <div className="col-span-full py-12 text-center text-error bg-error-container/20 rounded-2xl">
            <span className="material-symbols-outlined text-4xl mb-2">error</span>
            <p>{error}</p>
          </div>
        ) : filteredCrops.map(crop => (
          <div key={crop.id} className="bg-surface-container-lowest p-card-padding-mobile md:p-card-padding-desktop rounded-2xl shadow-sm hover:shadow-xl transition-shadow duration-300 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">{crop.icon}</span>
                </div>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface">{crop.name}</h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{crop.grade} • {crop.mandi}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full font-label-sm text-label-sm ${crop.trendBg}`}>{crop.status}</span>
            </div>
            <div className="flex items-end gap-3 mb-6">
              <span className="font-display-lg text-display-lg text-on-surface">₹{crop.price.toLocaleString()}</span>
              <span className="font-body-md text-body-md text-on-surface-variant pb-2">/ {crop.unit}</span>
            </div>
            
            <div className={`flex items-center gap-2 mb-6 font-label-lg text-label-lg bg-surface-container p-2 rounded-lg w-fit ${crop.trendColor}`}>
              <span className="material-symbols-outlined text-sm">
                {crop.trend === 'up' ? 'trending_up' : crop.trend === 'down' ? 'trending_down' : 'trending_flat'}
              </span>
              {crop.trend === 'up' ? '+' : crop.trend === 'down' ? '-' : ''}₹{crop.trendAmount} ({crop.trendPercent}%)
              <span className="opacity-70 font-body-sm">· {crop.trendBasis || 'day-on-day'}</span>
            </div>

            {/* Where today's modal price sits inside the day's min-max band */}
            <div className="mt-auto">
              <div className="relative h-2 bg-surface-variant rounded-full">
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-surface-container-lowest"
                  style={{ left: crop.barHeight || '50%' }}
                  title={`Modal ₹${crop.price?.toLocaleString()}`}
                ></div>
              </div>
              <div className="flex justify-between mt-2 font-label-sm text-label-sm text-on-surface-variant">
                <span>Low ₹{(crop.minPrice ?? crop.price)?.toLocaleString()}</span>
                <span>High ₹{(crop.maxPrice ?? crop.price)?.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
        {!loading && !error && filteredCrops.length === 0 && (
          <div className="col-span-full py-12 text-center text-on-surface-variant">
            No commodities found matching your filters.
          </div>
        )}
      </div>


    </div>
  );
}
