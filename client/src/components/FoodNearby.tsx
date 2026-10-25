import { useEffect, useRef, useState } from 'react';
import type { CoolingPoint, FoodPlace } from '../types';
import { DELIVEROO_URL, UBER_EATS_URL, fetchFood } from '../lib/food';
import { directionsUrl, formatDistance } from '../lib/maps';

interface Props {
  point: CoolingPoint;
  /** Called when the block changes size, so the map popup can re-fit. */
  onResize?: () => void;
}

type State = { status: 'idle' | 'loading' } | { status: 'done'; places: FoodPlace[] } | { status: 'error'; error: string };

/** "Hungry while you wait?": delivery apps plus real food places near a cool spot. */
export default function FoodNearby({ point, onResize }: Props) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const resize = useRef(onResize);
  resize.current = onResize;

  useEffect(() => {
    resize.current?.();
  }, [state]);

  const load = async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', places: await fetchFood(point.lat, point.lng) });
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <section className="food" aria-label="Food near this spot">
      <p className="food-title">Hungry while you wait?</p>
      <p className="food-hint">Order delivery, with this spot as the address:</p>
      <div className="food-apps">
        <a href={UBER_EATS_URL} target="_blank" rel="noopener noreferrer">
          Uber Eats
        </a>
        <a href={DELIVEROO_URL} target="_blank" rel="noopener noreferrer">
          Deliveroo
        </a>
      </div>

      {state.status !== 'done' && (
        <>
          {state.status === 'error' && <p className="food-note">{state.error}</p>}
          {/* One button for all three states: the map closes its popup if the
              element you just clicked disappears, so it must stay on the page. */}
          <button type="button" className="food-show" onClick={load} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Looking around…' : state.status === 'error' ? 'Try again' : 'Show food places nearby'}
          </button>
        </>
      )}
      {state.status === 'done' && state.places.length === 0 && <p className="food-note">No food places found within 500 m.</p>}
      {state.status === 'done' && state.places.length > 0 && (
        <>
          <ul className="food-list">
            {state.places.map((p) => (
              <li key={p.id}>
                <span className="food-name">{p.name}</span>
                <span className="food-meta">
                  {p.kind}
                  {p.cuisine ? `, ${p.cuisine}` : ''}, {formatDistance(p.distance)}
                </span>
                <a href={directionsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
                  Walk there
                </a>
              </li>
            ))}
          </ul>
          <p className="food-source">Places from OpenStreetMap contributors</p>
        </>
      )}
    </section>
  );
}