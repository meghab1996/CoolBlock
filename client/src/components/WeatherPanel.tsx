import { useMemo, useState, type KeyboardEvent } from 'react';
import type { DailyWeather, HeatEpisode, Weather } from '../types';
import { longDate, shortDate } from '../lib/format';

const HEATWAVE_MAX = 31;
const HOT_DAY = 30;

const DAY_COLOR = { normal: '#a9b6bd', hot: '#ee8c5f', heatwave: '#a8431a' };

function dayKind(d: DailyWeather, episodes: HeatEpisode[]) {
  if (episodes.some((e) => d.date >= e.start && d.date <= e.end)) return 'heatwave' as const;
  return d.max >= HOT_DAY ? ('hot' as const) : ('normal' as const);
}

function HeatIcon({ level }: { level: Weather['heat']['level'] }) {
  if (level === 'normal') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="heat-icon">
        <circle cx="8" cy="8" r="6" fill="#0ca30c" />
        <path d="M5 8.2 7.1 10.2 11 6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="heat-icon">
      <path d="M8 1.5 15 14.5H1Z" fill={level === 'heatwave' ? '#d03b3b' : '#ec835a'} />
      <rect x="7.2" y="6" width="1.6" height="4.5" rx=".8" fill="#fff" />
      <circle cx="8" cy="12.3" r=".95" fill="#fff" />
    </svg>
  );
}

/** Daily min–max bars with the heatwave threshold, one bar per day. */
function DayRangeChart({ weather }: { weather: Weather }) {
  const { daily, stats } = weather;
  const [active, setActive] = useState<number | null>(null);

  const W = 300;
  const H = 128;
  const pad = { top: 8, bottom: 20, left: 0, right: 30 };
  const lo = Math.floor(Math.min(...daily.map((d) => d.min), 5) / 5) * 5;
  const hi = Math.ceil(Math.max(...daily.map((d) => d.max), 35) / 5) * 5;
  const y = (t: number) => pad.top + ((hi - t) / (hi - lo)) * (H - pad.top - pad.bottom);
  const step = (W - pad.left - pad.right) / daily.length;
  const barW = Math.max(2, Math.min(14, step * 0.62));

  const monthTicks = useMemo(
    () => daily.map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || d.date.endsWith('-01')),
    [daily],
  );

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(daily.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? daily.length) - 1));
    else return;
    e.preventDefault();
  };

  const a = active === null ? null : daily[active];
  return (
    <figure className="day-chart">
      <p className="chart-readout" aria-live="polite">
        {a ? (
          <>
            <strong>{longDate(a.date)}</strong>: {Math.round(a.min)}–{Math.round(a.max)} °C
            {a.feelsMax !== null && <span className="muted">, felt like {Math.round(a.feelsMax)} °C</span>}
          </>
        ) : (
          <span className="muted">Hover or use arrow keys for each day</span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`Daily temperatures, ${weather.periodLabel}. ${stats.hotDays} days at ${HOT_DAY} °C or more.`}
        onKeyDown={onKey}
        onMouseLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        {[lo, (lo + hi) / 2, hi].map((t) => (
          <g key={t}>
            <line x1={0} x2={W - pad.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={W - pad.right + 4} y={y(t) + 3} className="tick">
              {t}°
            </text>
          </g>
        ))}
        <line x1={0} x2={W - pad.right} y1={y(HEATWAVE_MAX)} y2={y(HEATWAVE_MAX)} className="threshold" />
        <text x={W - pad.right + 4} y={y(HEATWAVE_MAX) + 3} className="tick threshold-label">
          31°
        </text>

        {daily.map((d, i) => {
          const x = pad.left + i * step + (step - barW) / 2;
          const top = y(d.max);
          const h = Math.max(barW, y(d.min) - top);
          return (
            <g key={d.date} onMouseEnter={() => setActive(i)}>
              <rect x={pad.left + i * step} y={0} width={step} height={H - pad.bottom} fill="transparent" />
              <rect
                x={x}
                y={top}
                width={barW}
                height={h}
                rx={barW / 2}
                fill={DAY_COLOR[dayKind(d, stats.episodes)]}
                opacity={active === null || active === i ? 1 : 0.45}
              />
            </g>
          );
        })}
        {monthTicks.map(({ d, i }) => (
          <text key={d.date} x={pad.left + i * step} y={H - 4} className="tick">
            {daily.length > 10
              ? new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { month: 'long' })
              : shortDate(d.date)}
          </text>
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i style={{ background: DAY_COLOR.heatwave }} /> Heatwave day
        </span>
        <span>
          <i style={{ background: DAY_COLOR.hot }} /> 30 °C or more
        </span>
        <span>
          <i className="dash" /> Heatwave threshold
        </span>
      </figcaption>
    </figure>
  );
}

export default function WeatherPanel({ weather, error }: { weather: Weather | null; error: string | null }) {
  if (error) {
    return (
      <section className="rail-section">
        <h2>Weather</h2>
        <p className="notice">{error}</p>
      </section>
    );
  }
  if (!weather) {
    return (
      <section className="rail-section">
        <h2>Weather</h2>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  const { stats, heat, current } = weather;
  return (
    <section className="rail-section">
      <h2>Weather, {weather.periodLabel}</h2>
      <p className={`heat-level heat-${heat.level}`}>
        <HeatIcon level={heat.level} />
        <strong>{heat.label}</strong>
      </p>
      <p className="heat-detail">{heat.detail}</p>

      {current && (
        <p className="now">
          Now <strong>{Math.round(current.temp)} °C</strong>, feels like {Math.round(current.feelsLike)} °C, humidity {current.humidity}%
        </p>
      )}

      <dl className="weather-stats">
        <div>
          <dt>Days at 30 °C or more</dt>
          <dd>{stats.hotDays}</dd>
        </div>
        <div>
          <dt>Nights at 20 °C or more</dt>
          <dd>{stats.tropicalNights}</dd>
        </div>
        <div>
          <dt>Hottest day</dt>
          <dd>
            {Math.round(stats.hottestDay.max)} °C <small>{shortDate(stats.hottestDay.date)}</small>
          </dd>
        </div>
      </dl>

      <DayRangeChart weather={weather} />
      <p className="source">{weather.source}</p>
    </section>
  );
}