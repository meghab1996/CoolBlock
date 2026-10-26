import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Ludo from './Ludo';
import Minesweeper from './Minesweeper';
import Poker from './Poker';
import EmergencyButton from '../components/EmergencyButton';

type GameId = 'ludo' | 'mines' | 'poker';
const GAMES: { id: GameId; label: string }[] = [
  { id: 'ludo', label: 'Ludo' },
  { id: 'mines', label: 'Minesweeper' },
  { id: 'poker', label: 'Poker' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen games panel. It stays mounted while closed, so a game in progress
 * is still there when you come back. Games pause while they're not on screen.
 */
export default function GamesOverlay({ open, onClose }: Props) {
  const [game, setGame] = useState<GameId>('ludo');
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      before?.focus();
    };
  }, [open]);

  // Rendered into <body> so the map's own layers can't clip or cover it.
  return createPortal(
    <div className="games" role="dialog" aria-modal="true" aria-labelledby="games-title" hidden={!open}>
      <header className="games-head">
        <div>
          <h2 id="games-title">Play while you wait</h2>
          <p className="muted">Stay in the shade, drink some water.</p>
        </div>
        <div className="games-head-actions">
          <EmergencyButton />
          <button ref={closeRef} type="button" className="ghost" onClick={onClose}>
            Back to map
          </button>
        </div>
      </header>
      <div className="games-tabs" role="tablist" aria-label="Games">
        {GAMES.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={game === g.id} onClick={() => setGame(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="games-body">
        <div hidden={game !== 'ludo'}>
          <Ludo active={open && game === 'ludo'} />
        </div>
        <div hidden={game !== 'mines'}>
          <Minesweeper active={open && game === 'mines'} />
        </div>
        <div hidden={game !== 'poker'}>
          <Poker active={open && game === 'poker'} />
        </div>
      </div>
    </div>,
    document.body,
  );
}