import type { Area } from '../types';
import { scoreColor } from '../lib/format';

interface Props {
  areas: Area[];
  selected: number | null;
  onSelect: (code: number) => void;
}

/** The 20 arrondissements ranked weakest first; doubles as a bar chart and a picker. */
export default function Ledger({ areas, selected, onSelect }: Props) {
  const ranked = [...areas].sort((a, b) => a.index.gapRank - b.index.gapRank);
  return (
    <section className="rail-section ledger">
      <h2>Cooling access score</h2>
      <p className="muted small">Weakest first, out of 100, relative to the rest of Paris.</p>
      <ol>
        {ranked.map((a) => (
          <li key={a.code}>
            <button
              className={`ledger-row${a.code === selected ? ' selected' : ''}`}
              aria-pressed={a.code === selected}
              onClick={() => onSelect(a.code)}
              title={`${a.name} (${a.label}): ${a.index.score}/100`}
            >
              <span className="ledger-rank">{a.index.gapRank}</span>
              <span className="ledger-name">
                <strong>{a.name}</strong> <span>{a.label}</span>
              </span>
              <span className="ledger-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(2, a.index.score)}%`, background: scoreColor(a.index.score) }} />
              </span>
              <span className="ledger-score">{a.index.score}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}