import { useEffect } from 'react';
import type { Area, Recommendation, Source, Weather } from '../types';
import { longDate, ordinal } from '../lib/format';
import { IndicatorTable } from './AreaPanel';
import RecommendationBody from './RecommendationBody';

interface Props {
  area: Area;
  areas: Area[];
  rec: Recommendation;
  weather: Weather | null;
  sources: Source[];
  caveats: string[];
  generatedAt: string;
  onClose: () => void;
}

/** Print-friendly page. "Save as PDF" in the browser's print dialog gives you the PDF. */
export default function ReportView({ area, areas, rec, weather, sources, caveats, generatedAt, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('printing-report');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('printing-report');
    };
  }, [onClose]);

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Printable report">
      <div className="report-toolbar">
        <button className="primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <article className="report">
        <header>
          <p className="report-kicker">CoolBlock cooling recommendation</p>
          <h1>
            {area.name} arrondissement, {area.label}
          </h1>
          <p className="report-meta">
            Prepared {longDate(new Date().toISOString())}. Cooling access score {area.index.score}/100,{' '}
            {area.index.gapRank === 1 ? 'the weakest' : `${ordinal(area.index.gapRank)} weakest`} of 20 arrondissements.
          </p>
        </header>

        {weather && (
          <section>
            <h2>Heat context: {weather.periodLabel}</h2>
            <p>
              {weather.heat.label}. {weather.heat.detail} {weather.stats.hotDays} days reached 30 °C or more and {weather.stats.tropicalNights}{' '}
              nights stayed at 20 °C or above.
            </p>
          </section>
        )}

        <section>
          <h2>Indicators</h2>
          <IndicatorTable area={area} areas={areas} />
        </section>

        <section>
          <h2>Recommendation</h2>
          <RecommendationBody rec={rec} />
        </section>

        <section className="report-small">
          <h2>Method and limits</h2>
          <ul>
            {caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <h2>Sources</h2>
          <ul>
            {sources.map((s) => (
              <li key={s.id}>
                {s.title}: {s.url}
              </li>
            ))}
            {weather && <li>{weather.source}</li>}
          </ul>
          <p>
            Data built {longDate(generatedAt)}. The recommendation was drafted with AI from these figures; check them before publishing.
          </p>
        </section>
      </article>
    </div>
  );
}