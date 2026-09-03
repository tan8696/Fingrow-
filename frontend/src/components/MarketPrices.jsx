import React, { useState, useMemo, useEffect } from 'react';
import { fetchMarketPrices } from '../hooks/useReport';

export default function MarketPrices() {
  const [crops, setCrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All Categories');
  const [mandi, setMandi] = useState('All Mandis');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetchMarketPrices()
      .then(data => {
        if (isMounted) {
          setCrops(data.crops || data.prices || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error(err);
          setError('Failed to load market prices.');
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, []);

  const filteredCrops = useMemo(() => {
    return crops.filter(crop => {
      const matchesSearch = !search.trim() || crop.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All Categories' || crop.category === category;
      const matchesMandi = mandi === 'All Mandis' || (crop.mandi && crop.mandi.toLowerCase().includes(mandi.toLowerCase()));
      return matchesSearch && matchesCategory && matchesMandi;
    });
  }, [crops, search, category, mandi]);

  return (
    <div className="max-w-7xl mx-auto space-y-stack-gap">
      {/* Header Section */}
      <div className="mb-stack-gap">
        <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">Real-Time Commodities</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant">Track current prices and 7-day trends across local mandis.</p>
      </div>

      {/* Search & Filters */}
      <div className="bg-surface-container-lowest p-card-padding-mobile md:p-card-padding-desktop rounded-2xl shadow-sm mb-stack-gap flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input 
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-outline-variant bg-surface-bright text-on-surface focus:ring-2 focus:ring-primary focus:border-primary font-body-md text-body-md transition-shadow min-h-[56px]" 
            placeholder="Search crops (e.g. Wheat, Rice)..." 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-4 flex-col sm:flex-row">
          <select 
            className="pl-4 pr-10 py-4 rounded-xl border border-outline-variant bg-surface-bright text-on-surface focus:ring-2 focus:ring-primary font-body-md text-body-md min-h-[56px] min-w-[160px]"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>All Categories</option>
            <option>Cereals</option>
            <option>Pulses</option>
            <option>Oilseeds</option>
            <option>Cash Crops</option>
          </select>
          <select 
            className="pl-4 pr-10 py-4 rounded-xl border border-outline-variant bg-surface-bright text-on-surface focus:ring-2 focus:ring-primary font-body-md text-body-md min-h-[56px] min-w-[160px]"
            value={mandi}
            onChange={(e) => setMandi(e.target.value)}
          >
            <option>All Mandis</option>
            <option>Local Mandi (Auto)</option>
            <option>Azadpur Mandi</option>
            <option>Vashi APMC</option>
            <option>Karnal</option>
            <option>Rajkot</option>
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
              {crop.trend === 'up' ? '+' : crop.trend === 'down' ? '-' : ''}₹{crop.trendAmount} ({crop.trendPercent}%) today
            </div>

            <div className="mt-auto h-16 bg-surface-variant rounded-lg relative overflow-hidden flex items-end">
              {/* Using a simpler approach since dynamic Tailwind classes like h-1/2 might be purged if not explicitly safelisted */}
              <div className={`w-full ${crop.barColor} rounded-t-lg`} style={{ height: crop.barHeight === '1/2' ? '50%' : crop.barHeight === '1/3' ? '33.33%' : crop.barHeight === '3/4' ? '75%' : crop.barHeight === '2/3' ? '66.66%' : '25%' }}></div>
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
