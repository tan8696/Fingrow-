/**
 * SupplierMap — displays nearby suppliers/service providers relevant
 * to the user's business category, sourced from OSM.
 *
 * Props:
 *   suppliers        — array from backend supplier_summary.sample_suppliers
 *   businessCategory — the selected business category
 *   locationName     — display name for the area
 */

// Fallback supplier suggestions when no OSM data is available
const CATEGORY_SUGGESTIONS = {
  dairy: [
    { name: 'Veterinary Clinic', type: 'veterinary', icon: '🏥', hint: 'Animal health services & vaccinations' },
    { name: 'Cattle Feed Supplier', type: 'feed_shop', icon: '🌾', hint: 'Bulk feed and supplements' },
    { name: 'Milk Collection Center', type: 'collection', icon: '🥛', hint: 'Cooperative milk collection point' },
  ],
  grocery: [
    { name: 'Wholesale Market (APMC)', type: 'wholesale', icon: '🏪', hint: 'Bulk wholesale goods at lower rates' },
    { name: 'Cold Storage', type: 'cold_storage', icon: '❄️', hint: 'Preserve perishable inventory' },
    { name: 'Packaging Supplier', type: 'packaging', icon: '📦', hint: 'Bags, boxes, and branding materials' },
  ],
  tailoring: [
    { name: 'Wholesale Cloth Market', type: 'textile', icon: '🧵', hint: 'Fabric at wholesale prices' },
    { name: 'Sewing Machine Dealer', type: 'equipment', icon: '🪡', hint: 'Machines, parts & servicing' },
    { name: 'Button & Lace Supplier', type: 'accessories', icon: '🎀', hint: 'Trimmings and accessories' },
  ],
  poultry: [
    { name: 'Veterinary Clinic', type: 'veterinary', icon: '🏥', hint: 'Poultry health & vaccination' },
    { name: 'Feed Mill', type: 'feed_mill', icon: '⚙️', hint: 'Poultry feed and supplements' },
    { name: 'Egg Collection Agent', type: 'collection', icon: '🥚', hint: 'Daily egg collection & wholesale' },
  ],
  pharmacy: [
    { name: 'Pharmaceutical Distributor', type: 'distributor', icon: '💊', hint: 'Licensed drug wholesale' },
    { name: 'Medical Equipment Supplier', type: 'equipment', icon: '🩺', hint: 'Devices, thermometers, supplies' },
  ],
  restaurant: [
    { name: 'Wholesale Vegetable Market', type: 'wholesale', icon: '🥦', hint: 'Fresh produce at APMC rates' },
    { name: 'Kitchen Equipment Dealer', type: 'equipment', icon: '🍳', hint: 'Commercial kitchen equipment' },
    { name: 'Gas (LPG) Distributor', type: 'fuel', icon: '🔥', hint: 'Commercial LPG cylinders' },
  ],
  bakery: [
    { name: 'Flour & Sugar Wholesale', type: 'wholesale', icon: '🌾', hint: 'Bulk baking ingredients' },
    { name: 'Bakery Equipment Dealer', type: 'equipment', icon: '🧁', hint: 'Ovens, mixers, moulds' },
  ],
};

const DEFAULT_SUGGESTIONS = [
  { name: 'Local Wholesale Market', type: 'wholesale', icon: '🏬', hint: 'Bulk supplies at trade prices' },
  { name: 'Transport & Logistics', type: 'transport', icon: '🚚', hint: 'Local transport services' },
  { name: 'Bank / Micro-Finance Branch', type: 'finance', icon: '🏦', hint: 'Nearest lending branch' },
];

const TYPE_COLORS = {
  veterinary: 'bg-red-50 text-red-700 border-red-200',
  feed_shop: 'bg-amber-50 text-amber-700 border-amber-200',
  feed_mill: 'bg-amber-50 text-amber-700 border-amber-200',
  collection: 'bg-blue-50 text-blue-700 border-blue-200',
  wholesale: 'bg-green-50 text-green-700 border-green-200',
  cold_storage: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  textile: 'bg-purple-50 text-purple-700 border-purple-200',
  equipment: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  distributor: 'bg-pink-50 text-pink-700 border-pink-200',
  fuel: 'bg-orange-50 text-orange-700 border-orange-200',
  transport: 'bg-slate-50 text-slate-700 border-slate-200',
  finance: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  accessories: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  packaging: 'bg-teal-50 text-teal-700 border-teal-200',
};

export default function SupplierMap({ suppliers, businessCategory, locationName }) {
  // Use backend data if available, otherwise show category-specific suggestions
  const hasLiveData = suppliers && suppliers.length > 0;

  const suggestionCards = hasLiveData
    ? suppliers.slice(0, 8).map((s, i) => ({
        name: s.name || 'Unnamed Supplier',
        type: s.category || 'wholesale',
        icon: s.category === 'veterinary' ? '🏥' : s.category === 'feed' ? '🌾' : '📍',
        hint: s.distance_estimate || 'Nearby',
      }))
    : (CATEGORY_SUGGESTIONS[businessCategory] || DEFAULT_SUGGESTIONS);

  // Group by type
  const grouped = {};
  for (const s of suggestionCards) {
    const key = s.type || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  return (
    <div className="supplier-map">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🔗</span>
        <div>
          <h3 className="font-headline-md text-[18px] font-bold text-on-surface">
            {hasLiveData ? 'Nearby Suppliers & Partners' : 'Suggested Supply Chain Links'}
          </h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {hasLiveData
              ? `${suppliers.length} supplier${suppliers.length > 1 ? 's' : ''} found near ${locationName || 'your area'}`
              : `Key suppliers for your ${(businessCategory || 'business').replace(/_/g, ' ')} venture`}
          </p>
        </div>
        {hasLiveData && (
          <span className="ml-auto px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-label-sm text-label-sm font-bold">
            Live OSM
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestionCards.map((supplier, i) => {
          const colorCls = TYPE_COLORS[supplier.type] || 'bg-surface-container-low text-on-surface-variant border-outline-variant';
          return (
            <div
              key={`${supplier.name}-${i}`}
              className={`p-4 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 ${colorCls}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{supplier.icon}</span>
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg font-semibold truncate">{supplier.name}</p>
                  <p className="font-label-sm text-[12px] mt-0.5 opacity-80">{supplier.hint}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!hasLiveData && (
        <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 flex items-start gap-2">
          <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">info</span>
          These are recommended supply chain partners for your business type.
          Generate a report with your location for live OSM-sourced supplier data.
        </p>
      )}
    </div>
  );
}
