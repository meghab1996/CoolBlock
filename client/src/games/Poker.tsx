import { useEffect, useState } from 'react';
import { act, bestScore, botAction, gameOver, handName, inHand, isRed, newGame, options, pot, rankLabel, startHand, type Card, type PokerState } from './poker-rules';

function CardView({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (!card || hidden) return <span className={`pk-card${card ? ' back' : ' empty'}`} aria-label={card ? 'Hidden card' : undefined} />;
  return (
    <span className={`pk-card${isRed(card) ? ' red' : ''}`}>
      <b>{rankLabel(card.rank)}</b>
      {card.suit}
    </span>
  );
}

function SeatView({ t, i }: { t: PokerState; i: number }) {
  const p = t.seats[i];
  const showdown = t.street === 'showdown' && inHand(p);
  const win = t.wins.find((w) => w.seat === i);
  const status = p.out
    ? 'Out of chips'
    : win
      ? `Wins ${win.amount}`
      : p.folded
        ? 'Folded'
        : t.toAct === i
          ? p.human
            ? 'Your turn'
            : 'Thinking…'
          : p.allIn
            ? 'All-in'
            : p.bet
              ? `Bet ${p.bet}`
              : '';
  return (
    <div className={`pk-seat${t.toAct === i ? ' turn' : ''}${p.folded || p.out ? ' folded' : ''}${win ? ' winner' : ''}`}>
      <p className="pk-name">
        {p.name}
        {t.dealer === i && (
          <span className="pk-dealer" title="Dealer">
            D
          </span>
        )}
      </p>
      <p className="pk-chips">{p.chips} chips</p>
      <div className="pk-cards">
        {p.hole.map((c, k) => (
          <CardView key={k} card={c} hidden={!p.human && !showdown} />
        ))}
      </div>
      <p className="pk-status">{showdown && t.board.length === 5 ? handName(bestScore([...p.hole, ...t.board])) : status}</p>
    </div>
  );
}

export default function Poker({ active }: { active: boolean }) {
  const [t, setT] = useState<PokerState>(() => newGame());
  const [raise, setRaise] = useState(0);
  const over = gameOver(t);
  const you = t.seats[0];
  const yourTurn = t.toAct === 0;
  const o = yourTurn ? options(t) : null;
  const raiseTo = o ? Math.max(o.minTo, Math.min(raise, o.maxTo)) : 0;

  // Computer players take their turn after a short pause.
  useEffect(() => {
    if (!active || t.toAct < 0 || t.seats[t.toAct].human) return;
    const id = setTimeout(() => setT(act(t, botAction(t))), 900);
    return () => clearTimeout(id);
  }, [t, active]);

  const yourHand = inHand(you) && t.board.length >= 3 ? handName(bestScore([...you.hole, ...t.board])) : null;

  return (
    <div className="pk">
      <div className="pk-table">
        <div className="pk-others">
          {t.seats.map((_, i) => (i === 0 ? null : <SeatView key={i} t={t} i={i} />))}
        </div>

        <div className="pk-middle">
          <div className="pk-board">
            {[0, 1, 2, 3, 4].map((k) => (
              <CardView key={k} card={t.board[k]} />
            ))}
          </div>
          <p className="pk-pot">Pot {pot(t)}</p>
        </div>

        <div className="pk-you">
          <SeatView t={t} i={0} />
          {yourHand && <p className="pk-hand">You have: {yourHand.toLowerCase()}</p>}
        </div>
      </div>

      <div className="pk-actions">
        {over ? (
          <>
            <p className="game-msg">{over === 'won' ? 'You won every chip at the table!' : "You're out of chips."}</p>
            <button type="button" className="primary" onClick={() => setT(newGame())}>
              Play again
            </button>
          </>
        ) : t.toAct === -1 ? (
          <button type="button" className="primary" onClick={() => setT(startHand(t))}>
            Next hand
          </button>
        ) : o ? (
          <>
            {!o.canCheck && (
              <button type="button" className="ghost" onClick={() => setT(act(t, { type: 'fold' }))}>
                Fold
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setT(act(t, { type: o.canCheck ? 'check' : 'call' }))}>
              {o.canCheck ? 'Check' : o.toCall >= you.chips ? `Call all-in (${o.toCall})` : `Call ${o.toCall}`}
            </button>
            {o.canRaise && (
              <div className="pk-raise">
                <input
                  type="range"
                  min={o.minTo}
                  max={o.maxTo}
                  step={10}
                  value={raiseTo}
                  onChange={(e) => setRaise(Number(e.target.value))}
                  aria-label="Raise amount"
                />
                <button type="button" className="primary" onClick={() => setT(act(t, { type: 'raise', to: raiseTo }))}>
                  {raiseTo === o.maxTo ? `All-in ${raiseTo}` : `${t.currentBet ? 'Raise to' : 'Bet'} ${raiseTo}`}
                </button>
                <button type="button" className="ghost" onClick={() => setT(act(t, { type: 'raise', to: o.maxTo }))}>
                  All-in
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="game-msg">{t.seats[t.toAct].name} is thinking…</p>
        )}
      </div>

      <ol className="pk-log" aria-live="polite">
        {t.log.map((line, k) => (
          <li key={`${t.handNo}-${k}`}>{line}</li>
        ))}
      </ol>
      <p className="game-note">Play chips only, no real money. Blinds 10 and 20; everyone starts with 1,000.</p>
    </div>
  );
}