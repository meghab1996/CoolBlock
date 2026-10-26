import type { Area } from '../types';
import type { RecommendationState } from '../App';
import { INDICATORS, median, num, ordinal, scoreColor } from '../lib/format';
import RecommendationBody from './RecommendationBody';

interface Props {
  area: Area | null;
  areas: Area[];
  aiReady: boolean;
  rec: RecommendationState | undefined;
  lang: 'en' | 'fr';
  onLangChange: (l: 'en' | 'fr') => void;
  onDraft: () => void;
  onOpenReport: () => void;
}

export function IndicatorTable({ area, areas }: { area: Area; areas: Area[] }) {
  return (
    <table className="indicator-table">
      <thead>
        <tr>
          <th scope="col">Indicator</th>
          <th scope="col">Here</th>
          <th scope="col">Paris median</th>
        </tr>
      </thead>
      <tbody>
        {INDICATORS.map((ind) => {
          const v = ind.value(area);
          const m = median(areas.map(ind.value));
          const below = v !== null && m !== null && v < m;
          return (
            <tr key={ind.key}>
              <th scope="row">
                {ind.label} <span className="unit">{ind.unit}</span>
              </th>
              <td className={below ? 'below' : ''}>
                {num(v)}
                {below && <span className="below-tag">below median</span>}
              </td>
              <td>{num(m)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function AreaPanel({ area, areas, aiReady, rec, lang, onLangChange, onDraft, onOpenReport }: Props) {
  if (!area) {
    return (
      <div className="empty">
        <h2>Pick an arrondissement</h2>
        <p>Click one on the map or in the ranking to see its cooling indicators and get an action plan from AI.</p>
      </div>
    );
  }

  return (
    <div className="area">
      <header className="area-head">
        <h2>
          {area.name} arrondissement <span>{area.label}</span>
        </h2>
        <div className="score-line">
          <span className="score-swatch" style={{ background: scoreColor(area.index.score) }} aria-hidden="true" />
          <span className="score-value">{area.index.score}</span>
          <span className="score-of">/100</span>
          <span className="score-rank">
            {area.index.gapRank === 1 ? 'Weakest' : `${ordinal(area.index.gapRank)} weakest`} of 20
          </span>
        </div>
      </header>

      <IndicatorTable area={area} areas={areas} />

      <dl className="counts">
        <div>
          <dt>Cool green spaces</dt>
          <dd>
            {area.greenSpaces}
            {area.nightOpenGreenSpaces !== null && <small> ({area.nightOpenGreenSpaces} open at night)</small>}
          </dd>
        </div>
        <div>
          <dt>Cool facilities</dt>
          <dd>{area.facilities}</dd>
        </div>
        <div>
          <dt>Drinking fountains</dt>
          <dd>{area.fountains}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{num(area.areaKm2)} km²</dd>
        </div>
      </dl>

      <section className="rec">
        <div className="rec-head">
          <h3>Action plan</h3>
          <label className="lang">
            <span className="visually-hidden">Language</span>
            <select value={lang} onChange={(e) => onLangChange(e.target.value as 'en' | 'fr')}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
        </div>

        {!aiReady && <p className="notice">Add your OpenAI key to server/.env and restart the server to get action plans.</p>}

        {(!rec || rec.status === 'error') && (
          <>
            {rec?.status === 'error' && <p className="notice">{rec.error}</p>}
            <button className="primary" onClick={onDraft} disabled={!aiReady}>
              {rec?.status === 'error' ? 'Try again' : 'Get an action plan'}
            </button>
            <p className="muted small">AI suggests what the city could do here, using this arrondissement's figures and the selected weather period.</p>
          </>
        )}

        {rec?.status === 'loading' && (
          <p className="loading" aria-live="polite">
            Drafting a recommendation for the {area.name}…
          </p>
        )}

        {rec?.status === 'done' && rec.data && (
          <>
            <RecommendationBody rec={rec.data} />
            <div className="rec-actions">
              <button className="primary" onClick={onOpenReport}>
                Open printable report
              </button>
              <button className="ghost" onClick={onDraft}>
                Draft again
              </button>
            </div>
            {rec.cached && <p className="muted small">Saved answer, replayed from the server cache.</p>}
          </>
        )}
      </section>
    </div>
  );
}