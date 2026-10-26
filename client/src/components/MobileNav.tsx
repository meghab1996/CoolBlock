import { useEffect, useState } from 'react';

type Section = 'map' | 'weather' | 'ranking' | 'details';

// On phones and tablets the page is one column: map, weather, ranking, then details.
const SECTIONS: { id: Section; label: string; selector: string }[] = [
  { id: 'map', label: 'Map', selector: '.map-area' },
  { id: 'weather', label: 'Weather', selector: '.rail > .rail-section:first-child' },
  { id: 'ranking', label: 'Ranking', selector: '.ledger' },
  { id: 'details', label: 'Details', selector: '.panel' },
];

/** True when the layout is one column (the same width as the CSS breakpoint). */
export const isStacked = () => window.matchMedia('(max-width: 980px)').matches;

const behavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export function showSection(id: Section) {
  // The map goes back to the very top, so the top bar and Emergency button show too.
  if (id === 'map') return window.scrollTo({ top: 0, behavior: behavior() });
  const el = document.querySelector(SECTIONS.find((s) => s.id === id)!.selector);
  el?.scrollIntoView({ behavior: behavior(), block: 'start' });
}

/** A bar at the bottom of small screens that jumps between the stacked sections. Hidden on wide screens (styles.css). */
export default function MobileNav() {
  const [active, setActive] = useState<Section>('map');

  useEffect(() => {
    let frame = 0;
    // The active button is the section that fills most of the screen.
    const update = () => {
      frame = 0;
      let best: Section = 'map';
      let most = -1;
      for (const s of SECTIONS) {
        const r = document.querySelector(s.selector)?.getBoundingClientRect();
        if (!r) continue;
        const seen = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
        if (seen > most) {
          most = seen;
          best = s.id;
        }
      }
      // At the very bottom of the page, the last section is the one you asked for.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) best = 'details';
      setActive(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav className="mobile-nav" aria-label="Sections">
      {SECTIONS.map((s) => (
        <button key={s.id} type="button" aria-current={active === s.id ? 'true' : undefined} onClick={() => showSection(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}