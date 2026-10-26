import type { Health, WeatherSelection } from '../types';
import EmergencyButton from './EmergencyButton';

interface Props {
  health: Health | null;
  weatherSel: WeatherSelection;
  onWeatherChange: (w: WeatherSelection) => void;
}

export default function TopBar({ health, weatherSel, onWeatherChange }: Props) {
  const years = health?.weatherYears ?? [weatherSel.year];
  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor" />
          <path d="M14 46 L14 26 L32 16 L50 26 L50 46 Z" fill="#fbfcfc" />
          <path d="M14 46 L32 36 L50 46 Z" fill="#9fd3cf" />
          <rect x="27" y="34" width="10" height="12" fill="currentColor" />
        </svg>
        <div>
          <h1>CoolBlock</h1>
          <p>Where Paris needs cooling most, by arrondissement</p>
        </div>
      </div>

      <div className="topbar-controls">
        <fieldset className="segmented">
          <legend className="visually-hidden">Weather period</legend>
          <label className={weatherSel.mode === 'history' ? 'on' : ''}>
            <input
              type="radio"
              name="weather-mode"
              checked={weatherSel.mode === 'history'}
              onChange={() => onWeatherChange({ ...weatherSel, mode: 'history' })}
            />
            May–June
          </label>
          <label className={weatherSel.mode === 'live' ? 'on' : ''}>
            <input
              type="radio"
              name="weather-mode"
              checked={weatherSel.mode === 'live'}
              onChange={() => onWeatherChange({ ...weatherSel, mode: 'live' })}
            />
            Live forecast
          </label>
        </fieldset>
        <label className="year-select">
          <span className="visually-hidden">Year</span>
          <select
            value={weatherSel.year}
            disabled={weatherSel.mode !== 'history'}
            onChange={(e) => onWeatherChange({ mode: 'history', year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        {health && (
          <span className={`ai-status ${health.ai.configured ? 'ok' : 'off'}`} title={health.ai.configured ? 'OpenAI connected' : 'Add OPENAI_API_KEY to server/.env'}>
            {health.ai.configured ? `AI on, ${health.ai.model}` : 'AI off: no API key'}
          </span>
        )}
        <EmergencyButton />
      </div>
    </header>
  );
}