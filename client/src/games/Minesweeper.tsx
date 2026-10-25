import { useEffect, useRef, useState } from 'react';
import { LEVELS, chord, flagsLeft, newBoard, reveal, toggleFlag, type Level } from './minesweeper-rules';

function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.8 2.5h7.4l-2 2.6 2 2.6H4.8z" fill="#c2410c" />
    </svg>
  );
}

function MineIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="4.2" fill="currentColor" />
      <circle cx="6.6" cy="6.6" r="1.1" fill="#fff" />
    </svg>
  );
}

const time = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Minesweeper({ active }: { active: boolean }) {
  const [level, setLevel] = useState<Level>('easy');
  const [b, setB] = useState(() => newBoard('easy'));
  const [flagMode, setFlagMode] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Long-press on a phone places a flag; this remembers the press so the tap that follows doesn't also dig.
  const press = useRef({ timer: 0, long: false, touch: false });

  useEffect(() => {
    if (!active || b.status !== 'playing') return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active, b.status]);

  const restart = (l: Level) => {
    setLevel(l);
    setB(newBoard(l));
    setSeconds(0);
  };
  const flag = (i: number) => setB((cur) => toggleFlag(cur, i));
  const dig = (i: number) => setB(b.cells[i].open ? chord(b, i) : reveal(b, i));

  const status =
    b.status === 'won'
      ? `Cleared in ${time(seconds)}!`
      : b.status === 'lost'
        ? 'Boom! You hit a mine.'
        : b.status === 'ready'
          ? 'Open any square to start. The first one is always safe.'
          : flagMode
            ? 'Flag mode: taps place flags.'
            : 'Long-press or right-click to flag a mine.';

  return (
    <div className="mines">
      <div className="game-setup">
        <div className="seg" role="group" aria-label="Difficulty">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => restart(l)}>
              {LEVELS[l].label}
            </button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={() => restart(level)}>
          New game
        </button>
      </div>

      <div className="mines-bar">
        <span>
          <FlagIcon /> {flagsLeft(b)} left
        </span>
        <span>{time(seconds)}</span>
        <button type="button" className={`mines-mode${flagMode ? ' on' : ''}`} aria-pressed={flagMode} onClick={() => setFlagMode((f) => !f)}>
          <FlagIcon /> Flag mode
        </button>
      </div>

      <div className={`mines-board ${level}${b.status === 'lost' || b.status === 'won' ? ' over' : ''}`} style={{ gridTemplateColumns: `repeat(${b.cols}, minmax(0, 1fr))` }}>
        {b.cells.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`mines-cell${c.open ? ' open' : ''}${i === b.boom ? ' boom' : ''}`}
            data-n={c.open && !c.mine && c.near ? c.near : undefined}
            aria-label={c.open ? (c.mine ? 'Mine' : c.near ? `${c.near} mines near` : 'Empty') : c.flag ? 'Flagged' : 'Hidden'}
            onPointerDown={(e) => {
              press.current.touch = e.pointerType !== 'mouse';
              press.current.long = false;
              if (!press.current.touch) return;
              press.current.timer = window.setTimeout(() => {
                press.current.long = true;
                flag(i);
                navigator.vibrate?.(15);
              }, 400);
            }}
            onPointerUp={() => clearTimeout(press.current.timer)}
            onPointerLeave={() => clearTimeout(press.current.timer)}
            onPointerCancel={() => clearTimeout(press.current.timer)}
            onClick={() => {
              if (press.current.long) {
                press.current.long = false;
                return;
              }
              if (flagMode && !c.open) flag(i);
              else dig(i);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!press.current.touch) flag(i);
            }}
          >
            {c.open ? c.mine ? <MineIcon /> : c.near || '' : c.flag ? <FlagIcon /> : ''}
          </button>
        ))}
      </div>

      <p className="game-msg" aria-live="polite">
        {status}
      </p>
    </div>
  );
}