import { useEffect, useState } from 'react';
import { COLOUR_NAME, HOME_COLUMN, SAFE, START, TRACK, chooseMove, current, movable, move, newLudo, pass, roll, tokenPoint, type Colour, type LudoState } from './ludo-rules';

const COLOURS: Colour[] = ['red', 'green', 'yellow', 'blue'];
/** Where each base sits on the 15 × 15 grid (row start / column start / row end / column end). */
const BASE_AREA: Record<Colour, string> = { red: '1 / 1 / 7 / 7', green: '1 / 10 / 7 / 16', yellow: '10 / 10 / 16 / 16', blue: '10 / 1 / 16 / 7' };
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

// Squares of the board: the shared track (start squares coloured, stars on safe squares) and the home columns.
const SQUARES = [
  ...TRACK.map(([r, c], i) => {
    const start = COLOURS.find((col) => START[col] === i);
    return { key: `t${i}`, r, c, className: start ? `ludo-sq ${start}` : 'ludo-sq', star: SAFE.has(i) && !start };
  }),
  ...COLOURS.flatMap((col) => HOME_COLUMN[col].map(([r, c], i) => ({ key: `${col}${i}`, r, c, className: `ludo-sq ${col}`, star: false }))),
];

const rollDie = () => 1 + Math.floor(Math.random() * 6);

function Die({ value, colour }: { value: number | null; colour: Colour }) {
  return (
    <div className={`die ${colour}`} role="img" aria-label={value ? `Dice: ${value}` : 'Dice not rolled yet'}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={value && PIPS[value].includes(i) ? 'pip' : undefined} />
      ))}
    </div>
  );
}

export default function Ludo({ active }: { active: boolean }) {
  const [computers, setComputers] = useState<1 | 3>(3);
  const [g, setG] = useState<LudoState>(() => newLudo(3));
  const colour = current(g);
  const yourTurn = g.turn === 0 && !g.winner;
  const options = movable(g);

  // Computer turns, passing when no move is possible, and moving for you when there's only one choice.
  useEffect(() => {
    if (!active || g.winner) return;
    const human = g.turn === 0;
    let step: (() => LudoState) | null = null;
    let delay = 700;
    if (g.dice === null) {
      if (!human) step = () => roll(g, rollDie());
    } else {
      const opts = movable(g);
      if (opts.length === 0) {
        step = () => pass(g);
        delay = 1200;
      } else if (!human) {
        step = () => move(g, chooseMove(g));
      } else if (new Set(opts.map((i) => g.tokens[g.players[0]][i])).size === 1) {
        step = () => move(g, opts[0]);
      }
    }
    if (!step) return;
    const run = step;
    const id = setTimeout(() => setG(run()), delay);
    return () => clearTimeout(id);
  }, [g, active]);

  // Tokens on the same square are spread out a little so you can see them all.
  const placed = g.players.flatMap((col) => g.tokens[col].map((p, i) => ({ col, i, pt: tokenPoint(col, p, i) })));
  const count = new Map<string, number>();
  placed.forEach(({ pt }) => count.set(String(pt), (count.get(String(pt)) ?? 0) + 1));
  const seen = new Map<string, number>();

  const newGame = (n: 1 | 3) => {
    setComputers(n);
    setG(newLudo(n));
  };

  return (
    <div className="ludo">
      <div className="ludo-board" aria-label="Ludo board">
        {COLOURS.map((col) => (
          <div key={col} className={`ludo-base ${col}`} style={{ gridArea: BASE_AREA[col] }}>
            <div className="ludo-base-inner">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} />
              ))}
            </div>
          </div>
        ))}
        {SQUARES.map((sq) => (
          <div key={sq.key} className={sq.className} style={{ gridRow: sq.r + 1, gridColumn: sq.c + 1 }}>
            {sq.star && '★'}
          </div>
        ))}
        <div className="ludo-centre" style={{ gridArea: '7 / 7 / 10 / 10' }} />

        {placed.map(({ col, i, pt }) => {
          const key = String(pt);
          const n = count.get(key) ?? 1;
          const k = seen.get(key) ?? 0;
          seen.set(key, k + 1);
          const shift = n > 1 ? (k - (n - 1) / 2) * 0.28 : 0;
          const canMove = yourTurn && col === g.players[0] && g.dice !== null && options.includes(i);
          return (
            <button
              key={`${col}${i}`}
              type="button"
              className={`ludo-token ${col}${canMove ? ' can-move' : ''}${n > 1 ? ' stacked' : ''}`}
              style={{ top: `${((pt[0] + shift * 0.5) / 15) * 100}%`, left: `${((pt[1] + shift) / 15) * 100}%` }}
              disabled={!canMove}
              onClick={() => setG(move(g, i))}
              aria-label={`${COLOUR_NAME[col]} token ${i + 1}${canMove ? ', can move' : ''}`}
            />
          );
        })}
      </div>

      <div className="ludo-side">
        <p className="ludo-turn">
          <span className={`ludo-dot ${g.winner ?? colour}`} />
          {g.winner ? (g.winner === g.players[0] ? 'You win!' : `${COLOUR_NAME[g.winner]} wins`) : yourTurn ? 'Your turn' : `${COLOUR_NAME[colour]} is playing…`}
        </p>
        <div className="ludo-roll">
          <Die value={g.dice} colour={colour} />
          <button type="button" className="primary" onClick={() => setG(roll(g, rollDie()))} disabled={!yourTurn || g.dice !== null}>
            Roll the dice
          </button>
        </div>
        <p className="game-msg" aria-live="polite">
          {g.message}
          {yourTurn && options.length > 1 ? ' Tap a glowing token to move it.' : ''}
        </p>
        <div className="game-setup">
          <label>
            Play against{' '}
            <select value={computers} onChange={(e) => newGame(Number(e.target.value) as 1 | 3)}>
              <option value={1}>1 computer</option>
              <option value={3}>3 computers</option>
            </select>
          </label>
          <button type="button" className="ghost" onClick={() => newGame(computers)}>
            New game
          </button>
        </div>
        <details className="game-rules">
          <summary>Rules</summary>
          <ul>
            <li>You are red. Roll a 6 to bring a token out of your base.</li>
            <li>Move clockwise round the board, then up your coloured lane to the centre.</li>
            <li>Land on another colour to send it back to base, except on starred and start squares.</li>
            <li>A 6 or a capture gives you another roll. You need the exact number to finish.</li>
            <li>The first to get all four tokens home wins.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}