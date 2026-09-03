import React, { useState, useEffect, useCallback } from 'react';
import { fetchWeather } from '../hooks/useReport';

const LEVEL_STYLES = {
  Low: { ring: '#006948', chip: 'bg-primary/10 text-primary', label: 'Low Risk' },
  Moderate: { ring: '#9b3e3b', chip: 'bg-tertiary/10 text-tertiary', label: 'Moderate Risk' },
  High: { ring: '#ba1a1a', chip: 'bg-error/10 text-error', label: 'High Risk' },
  Severe: { ring: '#93000a', chip: 'bg-error-container text-on-error-container', label: 'Severe Risk' },
};

const SEVERITY_CHIP = {
  info: 'bg-primary/10 text-primary',
  warning: 'bg-tertiary/10 text-tertiary',
  critical: 'bg-error-container text-on-error-container',
};

function fmtDay(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

export default function WeatherRisk({ locationText = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchWeather(locationText && locationText !== 'Vidarbha, MH' ? locationText : 'Akola, Maharashtra')
      .then(payload => { setData(payload); setLoading(false); })
      .catch(err => { console.error(err); setError(err.message || 'Weather is unavailable right now.'); setLoading(false); });
  }, [locationText]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-20 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p>Fetching live district weather & forecast…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center bg-surface-container-lowest rounded-2xl border border-surface-variant">
        <span className="material-symbols-outlined text-5xl text-error mb-3">cloud_off</span>
        <p className="font-body-lg text-body-lg text-on-surface mb-1">{error || 'Weather unavailable'}</p>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">The live feed could not be reached — check your internet connection and retry.</p>
        <button
          onClick={load}
          className="px-6 py-3 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const { current = {}, daily = [], risk = { score: 0, level: 'Low', factors: [], advisories: [] }, location = {} } = data;
  const levelStyle = LEVEL_STYLES[risk.level] || LEVEL_STYLES.Low;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Weather & Crop Risk</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Live 5-day forecast for <strong className="text-on-surface">{location.name || 'your district'}</strong> · Open-Meteo feed
          </p>
        </div>
        <span className="inline-flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Updated {data.fetched_at ? new Date(data.fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Current conditions */}
        <section className="lg:col-span-5 bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-headline-md text-headline-md text-on-surface">Current Conditions</h3>
            <span className="material-symbols-outlined text-primary text-3xl">{current.condition?.icon || 'cloud'}</span>
          </div>
          <div className="flex items-end gap-4 mb-6">
            <span className="font-display-lg text-display-lg text-on-surface">
              {current.temperature_c != null ? Math.round(current.temperature_c) : '—'}°C
            </span>
            <span className="pb-2 font-label-sm text-label-sm text-on-surface-variant">
              {current.apparent_temperature_c != null && `Feels ${Math.round(current.apparent_temperature_c)}°C`}
            </span>
          </div>
          <p className="font-label-lg text-label-lg text-primary mb-4">{current.condition?.label}</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface p-4 rounded-xl border border-surface-variant text-center">
              <span className="material-symbols-outlined text-primary text-xl mb-1">water_drop</span>
              <p className="font-headline-md text-[20px] text-on-surface font-bold">{current.humidity_pct ?? '—'}%</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Humidity</p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-surface-variant text-center">
              <span className="material-symbols-outlined text-primary text-xl mb-1">air</span>
              <p className="font-headline-md text-[20px] text-on-surface font-bold">{current.wind_kph ?? '—'}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Wind km/h</p>
            </div>
            <div className="bg-surface p-4 rounded-xl border border-surface-variant text-center">
              <span className="material-symbols-outlined text-primary text-xl mb-1">my_location</span>
              <p className="font-headline-md text-[20px] text-on-surface font-bold truncate">
                {location.latitude ? location.latitude.toFixed(2) : '—'}
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">{location.longitude ? location.longitude.toFixed(2) : ''}</p>
            </div>
          </div>
        </section>

        {/* Risk score + advisories */}
        <section className="lg:col-span-7 bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Crop Risk Advisory</h3>
            <span className={`px-3 py-1 rounded-full font-label-sm text-label-sm font-bold ${levelStyle.chip}`}>
              {levelStyle.label} · {risk.score}/10
            </span>
          </div>

          {/* Score ring */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-surface-container-high)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke={levelStyle.ring} strokeLinecap="round" strokeWidth="10"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - (risk.score || 0) / 10)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display-lg text-display-lg text-on-surface">{risk.score}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">/ 10</span>
              </div>
            </div>
            <div className="flex-1 w-full">
              {risk.factors?.length ? (
                <ul className="space-y-2">
                  {risk.factors.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 font-body-md text-body-md text-on-surface-variant text-sm">
                      <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0">info</span>
                      {f}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-body-md text-body-md text-on-surface-variant">No significant weather triggers detected.</p>
              )}
            </div>
          </div>

          {/* Advisories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(risk.advisories || []).map((advice, i) => (
              <div key={i} className="p-4 rounded-xl bg-surface border border-surface-variant flex items-start gap-3">
                <span className={`material-symbols-outlined shrink-0 mt-0.5 ${advice.severity === 'critical' ? 'text-error' : advice.severity === 'warning' ? 'text-tertiary' : 'text-primary'}`}>
                  {advice.icon || 'tips_and_updates'}
                </span>
                <div>
                  <p className="font-label-lg text-label-lg text-on-surface">{advice.title}</p>
                  <p className="font-body-md text-body-md text-on-surface-variant text-sm leading-relaxed">{advice.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 5-day forecast */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <h3 className="font-headline-md text-headline-md text-on-surface mb-6">5-Day Forecast</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {daily.map((day) => (
            <div key={day.date} className="bg-surface rounded-xl p-4 border border-surface-variant flex flex-col items-center text-center gap-2">
              <p className="font-label-sm text-label-sm text-on-surface-variant">{fmtDay(day.date)}</p>
              <span className="material-symbols-outlined text-3xl text-primary">{day.weather_code != null ? day.weather_code >= 95 ? 'thunderstorm' : day.weather_code >= 61 ? 'rainy' : day.weather_code >= 45 ? 'foggy' : 'wb_sunny' : 'cloud'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-headline-md text-[20px] font-bold text-on-surface">{day.temperature_2m_max != null ? Math.round(day.temperature_2m_max) : '—'}°</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">{day.temperature_2m_min != null ? Math.round(day.temperature_2m_min) : '—'}°</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden mt-1" />
              <div className="flex flex-col gap-1 text-[11px] w-full">
                <span className="text-on-surface-variant flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-primary">water_drop</span>
                  {day.precipitation_probability_max ?? 0}% rain
                </span>
                {day.precipitation_sum > 0 && (
                  <span className="text-primary font-medium">{day.precipitation_sum} mm expected</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
