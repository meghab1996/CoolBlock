import type { Recommendation } from '../types';

export default function RecommendationBody({ rec }: { rec: Recommendation }) {
  return (
    <div className="rec-body">
      <p className="rec-headline">{rec.headline}</p>
      <p>{rec.summary}</p>

      <h4>What the data shows</h4>
      <ul className="findings">
        {rec.findings.map((f, i) => (
          <li key={i}>
            {f.finding}
            <span className="evidence">{f.evidence}</span>
          </li>
        ))}
      </ul>

      <h4>Suggested actions</h4>
      <ol className="interventions">
        {rec.interventions.map((it, i) => (
          <li key={i}>
            <p className="it-title">{it.title}</p>
            <p className="it-tags">
              <span>{it.timeframe}</span>
              <span>{it.cost} cost</span>
            </p>
            <p>{it.description}</p>
            <p className="it-why">{it.rationale}</p>
          </li>
        ))}
      </ol>

      {rec.dataGaps.length > 0 && (
        <>
          <h4>Data that would help</h4>
          <ul className="gaps">
            {rec.dataGaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}