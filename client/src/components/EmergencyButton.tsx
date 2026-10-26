import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTouchDevice } from '../lib/share';

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
        fill="currentColor"
      />
    </svg>
  );
}

function AmbulanceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 14h24v20H4z" fill="#fff" />
      <path d="M28 20h8l6 7v7H28z" fill="#fff" opacity="0.85" />
      <path d="M14 18h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="currentColor" />
      <circle cx="12" cy="36" r="4" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <circle cx="34" cy="36" r="4" fill="#fff" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function PoliceIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4 40 10v12c0 10-7 18-16 22C15 40 8 32 8 22V10z" fill="#fff" />
      <path d="m24 14 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor" />
    </svg>
  );
}

/**
 * Emergency numbers for France. Each button is a tel: link: on a phone it opens the dialler
 * with the number ready, and the person still presses call, so nothing is dialled by accident.
 */
export default function EmergencyButton() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    // Esc closes only this panel, not the games panel underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [open]);

  return (
    <>
      <button type="button" className="sos-open" onClick={() => setOpen(true)}>
        <PhoneIcon />
        Emergency
      </button>

      {open &&
        createPortal(
          <div className="sos-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="sos" role="dialog" aria-modal="true" aria-labelledby="sos-title">
              <header className="sos-head">
                <h2 id="sos-title">Emergency help</h2>
                <button ref={closeRef} type="button" className="ghost" onClick={() => setOpen(false)}>
                  Close
                </button>
              </header>

              <div className="sos-calls">
                <a className="sos-call ambulance" href="tel:15">
                  <AmbulanceIcon />
                  <span className="sos-label">Ambulance</span>
                  <span className="sos-number">15</span>
                  <span className="sos-what">SAMU: medical emergencies, including heatstroke</span>
                </a>
                <a className="sos-call police" href="tel:17">
                  <PoliceIcon />
                  <span className="sos-label">Police</span>
                  <span className="sos-number">17</span>
                  <span className="sos-what">Danger, violence or theft</span>
                </a>
              </div>

              <p className="sos-hint">
                {isTouchDevice()
                  ? 'Tapping a button opens your phone app with the number ready. Press call to connect.'
                  : 'On a phone, tapping a button opens the dialler with the number ready. From a computer, call the number shown.'}
              </p>

              <ul className="sos-more">
                <li>
                  <a href="tel:112">112</a> Any emergency, anywhere in Europe. Operators speak English.
                </li>
                <li>
                  <a href="sms:114">114</a> By text message, if you can't hear or speak.
                </li>
              </ul>

              <section className="sos-heat" aria-label="Heatstroke">
                <h3>Signs of heatstroke: call 15</h3>
                <p>Confused speech, deep drowsiness, seizures, fainting, or hot and dry skin.</p>
                <p>
                  While you wait: move the person into the shade, lay them down and cool them with water and a fan. Give small sips of water only
                  if they are fully awake, and no paracetamol or aspirin.
                </p>
              </section>

              <p className="sos-advice">
                Heat advice (not emergencies): Canicule Info Service, <a href="tel:0800066666">0 800 06 66 66</a>, free, Monday to Saturday,
                9:00–19:00.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}