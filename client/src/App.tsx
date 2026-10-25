import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api';
import type { AreasResponse, CoolingPoint, Health, Recommendation, Weather, WeatherSelection } from './types';
import TopBar from './components/TopBar';
import WeatherPanel from './components/WeatherPanel';
import Ledger from './components/Ledger';
import CoolingMap, { type LayerState } from './components/CoolingMap';
import AreaPanel from './components/AreaPanel';
import ComparePanel from './components/ComparePanel';
import AiAssistant from './components/AiAssistant';
import ReportView from './components/ReportView';

type Tab = 'area' | 'compare' | 'ask';

export interface RecommendationState {
  status: 'loading' | 'done' | 'error';
  data?: Recommendation;
  cached?: boolean;
  error?: string;
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [data, setData] = useState<AreasResponse | null>(null);
  const [points, setPoints] = useState<CoolingPoint[]>([]);
  const [loadError, setLoadError] = useState<{ message: string; noData: boolean } | null>(null);

  const [weatherSel, setWeatherSel] = useState<WeatherSelection>({ mode: 'history', year: new Date().getFullYear() });
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('area');
  const [layers, setLayers] = useState<LayerState>({ green: true, facility: true, fountain: false, nightOnly: false });
  const [recs, setRecs] = useState<Record<string, RecommendationState>>({});
  const [lang, setLang] = useState<'en' | 'fr'>('en');
  const [reportOpen, setReportOpen] = useState(false);

  // Initial load
  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        if (h.weatherYears.length) setWeatherSel((w) => ({ ...w, year: h.weatherYears[0] }));
      })
      .catch(() => {});
    Promise.all([api.areas(), api.points()])
      .then(([areas, pts]) => {
        setData(areas);
        setPoints(pts);
      })
      .catch((err: unknown) => {
        setLoadError({
          message: err instanceof Error ? err.message : String(err),
          noData: err instanceof ApiError && err.code === 'NO_DATA',
        });
      });
  }, []);

  // Weather follows the period picker
  useEffect(() => {
    let cancelled = false;
    setWeatherError(null);
    api
      .weather(weatherSel)
      .then((w) => !cancelled && setWeather(w))
      .catch((err: unknown) => {
        if (cancelled) return;
        setWeather(null);
        setWeatherError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [weatherSel]);

  const weatherKey = `${weatherSel.mode}-${weatherSel.year}`;
  const recKey = selected ? `${selected}-${lang}-${weatherKey}` : '';
  const selectedArea = useMemo(() => data?.areas.find((a) => a.code === selected) ?? null, [data, selected]);

  const draftRecommendation = useCallback(async () => {
    if (!selected) return;
    const key = `${selected}-${lang}-${weatherKey}`;
    setRecs((r) => ({ ...r, [key]: { status: 'loading' } }));
    try {
      const res = await api.recommend({ code: selected, lang, weather: weatherSel });
      setRecs((r) => ({ ...r, [key]: { status: 'done', data: res.recommendation, cached: res.cached } }));
    } catch (err) {
      setRecs((r) => ({ ...r, [key]: { status: 'error', error: err instanceof Error ? err.message : String(err) } }));
    }
  }, [selected, lang, weatherKey, weatherSel]);

  const select = (code: number | null) => {
    setSelected(code);
    if (code && tab === 'compare') return;
    if (code) setTab((t) => (t === 'ask' ? t : 'area'));
  };

  if (loadError) {
    return (
      <div className="setup-screen">
        <h1>CoolBlock</h1>
        {loadError.noData ? (
          <>
            <p>The data hasn't been built yet. In a terminal in the project folder, run:</p>
            <pre>npm run data</pre>
            <p>It downloads the City of Paris datasets (about a minute the first time). Then refresh this page.</p>
          </>
        ) : (
          <p>{loadError.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar health={health} weatherSel={weatherSel} onWeatherChange={setWeatherSel} />
      <main className="layout">
        <aside className="rail" aria-label="Weather and ranking">
          <WeatherPanel weather={weather} error={weatherError} />
          {data && <Ledger areas={data.areas} selected={selected} onSelect={select} />}
        </aside>

        <section className="map-area" aria-label="Map">
          {data ? (
            <CoolingMap
              boundaries={data.boundaries}
              areas={data.areas}
              points={points}
              selected={selected}
              onSelect={select}
              layers={layers}
              onLayersChange={setLayers}
            />
          ) : (
            <div className="map-loading">Loading map data…</div>
          )}
        </section>

        <aside className="panel" aria-label="Details">
          <div className="tabs" role="tablist">
            {(
              [
                ['area', 'Area'],
                ['compare', 'Compare'],
                ['ask', 'Ask AI'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {data && tab === 'area' && (
              <AreaPanel
                area={selectedArea}
                areas={data.areas}
                aiReady={health?.ai.configured ?? false}
                rec={recKey ? recs[recKey] : undefined}
                lang={lang}
                onLangChange={setLang}
                onDraft={draftRecommendation}
                onOpenReport={() => setReportOpen(true)}
              />
            )}
            {data && tab === 'compare' && <ComparePanel areas={data.areas} initialA={selected} />}
            {/* Kept mounted so the conversation survives tab switches */}
            <div hidden={tab !== 'ask'} className="ask-wrap">
              <AiAssistant
                aiReady={health?.ai.configured ?? false}
                model={health?.ai.model}
                selectedArea={selectedArea}
                weather={weather}
                weatherSel={weatherSel}
              />
            </div>
          </div>
        </aside>
      </main>

      {reportOpen && selectedArea && data && recs[recKey]?.data && (
        <ReportView
          area={selectedArea}
          areas={data.areas}
          rec={recs[recKey].data!}
          weather={weather}
          sources={data.sources}
          caveats={data.caveats}
          generatedAt={data.generatedAt}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}