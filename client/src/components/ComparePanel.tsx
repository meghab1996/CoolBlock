import { useState } from 'react';
import type { Area } from '../types';
import { INDICATORS, SERIES, num } from '../lib/format';

interface Props {
  areas: Area[];
  initialA: number | null;
}

export default function ComparePanel({ areas, initialA }: Props) {
  const byRank = [...areas].sort((a, b) => a.index.gapRank - b.index.gapRank);
  const [codeA, setCodeA] = useState<number>(initialA ?? byRank[0].code);
  const [codeB, setCodeB] = useState<number>(byRank.at(-1)!.code === (initialA ?? byRank[0].code) ? byRank[0].code : byRank.at(-1)!.code);
  const a = areas.find((x) => x.code === codeA)!;
  const b = areas.find((x) => x.code === codeB)!;
  const pair = [a, b];

  const picker = (value: number, onChange: (n: number) => void, i: number) => (
    <label className="compare-pick">
      <i style={{ background: SERIES[i] }} aria-hidden="true" />
      <span className="visually-hidden">Arrondissement {i + 1}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[...areas]
          .sort((x, y) => x.code - y.code)
          .map((x) => (
            <option key={x.code} value={x.code}>
              {x.name} {x.label} ({x.index.score})
            </option>
          ))}
      </select>
    </label>
  );

  return (
    <div className="compare">
      <h2>Compare two arrondissements</h2>
      <div className="compare-picks">
        {picker(codeA, setCodeA, 0)}
        {picker(codeB, setCodeB, 1)}
      </div>

      <div className="compare-chart" role="list">
        {[{ key: 'score', label: 'Cooling access score', unit: 'out of 100', value: (x: Area) => x.index.score as number | null }, ...INDICATORS].map(
          (ind) => {
            const max = Math.max(...areas.map((x) => ind.value(x) ?? 0), 1);
            return (
              <div className="compare-row" role="listitem" key={ind.key}>
                <p className="compare-label">
                  {ind.label} <span className="unit">{ind.unit}</span>
                </p>
                {pair.map((x, i) => {
                  const v = ind.value(x);
                  return (
                    <div className="compare-bar" key={i} title={`${x.name}: ${num(v)} ${ind.unit}`}>
                      <span className="track">
                        <span style={{ width: `${v === null ? 0 : Math.max(1, (v / max) * 100)}%`, background: SERIES[i] }} />
                      </span>
                      <span className="compare-value">
                        {num(v)} <span className="muted">{x.name}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          },
        )}
      </div>
      <p className="muted small">Bar length is relative to the highest arrondissement in Paris for each indicator.</p>
    </div>
  );
}