import { useEffect, useRef, useState } from 'react';

const KEY = 'coolblock-intro-seen';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h16M7 16V10M12 16V5M17 16v-4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.4" />
    </svg>
  );
}

const STEPS = [
  {
    n: '01',
    verb: 'See',
    title: 'Spot the heat',
    text: "Check this summer's heatwave days and which arrondissements have the fewest cool places.",
    tone: 'lime',
    icon: <SunIcon />,
  },
  {
    n: '02',
    verb: 'Compare',
    title: 'Understand the gaps',
    text: 'Put two arrondissements side by side, then ask AI to draft a plan for the city.',
    tone: 'blush',
    icon: <BarsIcon />,
  },
  {
    n: '03',
    verb: 'Act',
    title: 'Find a cool spot',
    text: 'Find the nearest park, cool room or drinking fountain, with walking directions.',
    tone: 'mint',
    icon: <PinIcon />,
  },
];

/** Welcome screen shown once per visit, over the dashboard. */
export default function Intro() {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) !== '1';
    } catch {
      return true;
    }
  });
  const goRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      // Private mode: the intro simply shows again next time.
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    goRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-card">
        <header className="intro-head">
          <h2 id="intro-title">See where Paris runs hot, and where to cool down.</h2>
          <div className="intro-side">
            <p>
              CoolBlock maps cool green spaces, cool facilities and drinking fountains across the 20 arrondissements, scores each one, and helps
              the city decide where to act first.
            </p>
            <button ref={goRef} type="button" className="primary intro-go" onClick={close}>
              Open the map
            </button>
          </div>
        </header>
        <ol className="intro-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className={`intro-icon ${s.tone}`}>{s.icon}</span>
              <p className="intro-label">
                {s.n} · {s.verb}
              </p>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}