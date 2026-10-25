/**
 * Texas Hold'em rules, with no React: dealing, betting rounds, side pots,
 * hand ranking and computer players. Play chips only, no real money.
 */
export type Suit = '♠' | '♥' | '♦' | '♣';
/** rank: 2–10, 11 = J, 12 = Q, 13 = K, 14 = A */
export interface Card {
  rank: number;
  suit: Suit;
}

export const START_CHIPS = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
const BOT_NAMES = ['Ana', 'Bruno', 'Chloé'];

export const rankLabel = (r: number) => (r <= 10 ? String(r) : 'JQKA'[r - 11]);
export const isRed = (c: Card) => c.suit === '♥' || c.suit === '♦';
export const cardName = (c: Card) => `${rankLabel(c.rank)}${c.suit}`;

function shuffledDeck(rand: () => number): Card[] {
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  const deck = suits.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ---------- ranking hands ----------

/**
 * Scores 5 cards as [category, tie-breakers…]. A bigger score wins.
 * Categories: 0 high card, 1 pair, 2 two pair, 3 three of a kind, 4 straight,
 * 5 flush, 6 full house, 7 four of a kind, 8 straight flush.
 */
function score5(cards: Card[]): number[] {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  // Ranks grouped by how often they appear, biggest group first: 9-9-9-4-4 → [[9, 3], [4, 2]]
  const groups = unique.map((r) => [r, ranks.filter((x) => x === r).length]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, ...byGroup];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...byGroup];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup];
  if (groups[0][1] === 2) return [1, ...byGroup];
  return [0, ...ranks];
}

export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Best score from 5–7 cards. */
export function bestScore(cards: Card[]): number[] {
  let best = [-1];
  const pick: Card[] = [];
  const walk = (start: number) => {
    if (pick.length === 5) {
      const s = score5(pick);
      if (compareScores(s, best) > 0) best = s;
      return;
    }
    for (let i = start; i <= cards.length - (5 - pick.length); i++) {
      pick.push(cards[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return best;
}

const FACES: Record<number, string> = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
const single = (r: number) => FACES[r] ?? String(r);
const plural = (r: number) => `${single(r)}s`;

/** "Pair of kings", "Full house, 9s over 4s"… */
export function handName(score: number[]): string {
  const [kind, a, b] = score;
  const name = [
    `${single(a)} high`,
    `pair of ${plural(a)}`,
    `two pair, ${plural(a)} and ${plural(b)}`,
    `three ${plural(a)}`,
    `straight, ${single(a)} high`,
    `flush, ${single(a)} high`,
    `full house, ${plural(a)} over ${plural(b)}`,
    `four ${plural(a)}`,
    a === 14 ? 'royal flush' : `straight flush, ${single(a)} high`,
  ][kind];
  return name[0].toUpperCase() + name.slice(1);
}

// ---------- the table ----------

export interface Seat {
  name: string;
  human: boolean;
  chips: number;
  hole: Card[];
  /** Chips put in during this betting round. */
  bet: number;
  /** Chips put in during this hand. */
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last raise. */
  acted: boolean;
  /** No chips left: sits out. */
  out: boolean;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Win {
  seat: number;
  amount: number;
  /** Winning hand, or null when everyone else folded. */
  hand: string | null;
}

export interface PokerState {
  seats: Seat[];
  deck: Card[];
  board: Card[];
  dealer: number;
  street: Street;
  /** Seat whose turn it is, or -1 when the hand is over. */
  toAct: number;
  currentBet: number;
  minRaise: number;
  handNo: number;
  wins: Win[];
  /** What happened, newest last. */
  log: string[];
}

export type Action = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number };

export const pot = (s: PokerState) => s.seats.reduce((sum, p) => sum + p.total, 0);
export const inHand = (p: Seat) => !p.out && !p.folded;
const canAct = (p: Seat) => inHand(p) && !p.allIn;
/** "You call" / "Ana calls" */
const says = (p: Seat, you: string, other: string) => `${p.name} ${p.human ? you : other}`;

function clone(s: PokerState): PokerState {
  return { ...s, seats: s.seats.map((p) => ({ ...p })), board: [...s.board], deck: [...s.deck], log: [...s.log] };
}

function note(s: PokerState, text: string) {
  s.log = [...s.log.slice(-5), text];
}

function nextSeat(s: PokerState, from: number, ok: (p: Seat) => boolean): number {
  for (let k = 1; k <= s.seats.length; k++) {
    const i = (from + k) % s.seats.length;
    if (ok(s.seats[i])) return i;
  }
  return -1;
}

function putIn(p: Seat, amount: number) {
  const a = Math.min(amount, p.chips);
  p.chips -= a;
  p.bet += a;
  p.total += a;
  if (p.chips === 0) p.allIn = true;
}

export function newGame(rand: () => number = Math.random): PokerState {
  const seats: Seat[] = ['You', ...BOT_NAMES].map((name, i) => ({
    name,
    human: i === 0,
    chips: START_CHIPS,
    hole: [],
    bet: 0,
    total: 0,
    folded: false,
    allIn: false,
    acted: false,
    out: false,
  }));
  const empty: PokerState = { seats, deck: [], board: [], dealer: seats.length - 1, street: 'preflop', toAct: -1, currentBet: 0, minRaise: BIG_BLIND, handNo: 0, wins: [], log: [] };
  return startHand(empty, rand);
}

/** 'lost' when you have no chips, 'won' when nobody else has any. */
export function gameOver(s: PokerState): 'won' | 'lost' | null {
  if (s.toAct !== -1) return null;
  if (s.seats[0].chips === 0) return 'lost';
  if (s.seats.every((p) => p.human || p.chips === 0)) return 'won';
  return null;
}

export function startHand(prev: PokerState, rand: () => number = Math.random): PokerState {
  const s = clone(prev);
  for (const p of s.seats) Object.assign(p, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, out: p.chips === 0 });
  s.handNo += 1;
  s.board = [];
  s.wins = [];
  s.street = 'preflop';
  s.deck = shuffledDeck(rand);
  s.dealer = nextSeat(s, s.dealer, (p) => !p.out);
  for (const p of s.seats) if (!p.out) p.hole = [s.deck.pop()!, s.deck.pop()!];

  // Heads-up, the dealer posts the small blind.
  const players = s.seats.filter((p) => !p.out).length;
  const sb = players === 2 ? s.dealer : nextSeat(s, s.dealer, (p) => !p.out);
  const bb = nextSeat(s, sb, (p) => !p.out);
  putIn(s.seats[sb], SMALL_BLIND);
  putIn(s.seats[bb], BIG_BLIND);
  s.currentBet = BIG_BLIND;
  s.minRaise = BIG_BLIND;
  s.log = [];
  note(s, `Hand ${s.handNo}. ${says(s.seats[s.dealer], 'are', 'is')} the dealer.`);
  note(s, `Blinds: ${s.seats[sb].name} ${SMALL_BLIND}, ${s.seats[bb].name} ${BIG_BLIND}.`);
  s.toAct = bb;
  return advance(s);
}

export interface Options {
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  /** Smallest and largest total bet this player can raise to. */
  minTo: number;
  maxTo: number;
}

export function options(s: PokerState): Options {
  const p = s.seats[s.toAct];
  const toCall = Math.min(s.currentBet - p.bet, p.chips);
  const maxTo = p.bet + p.chips;
  const othersCanAct = s.seats.some((q, i) => i !== s.toAct && canAct(q));
  return {
    toCall,
    canCheck: p.bet >= s.currentBet,
    canRaise: othersCanAct && maxTo > s.currentBet,
    minTo: Math.min(s.currentBet + s.minRaise, maxTo),
    maxTo,
  };
}

export function act(prev: PokerState, action: Action): PokerState {
  if (prev.toAct < 0) return prev;
  const o = options(prev);
  const s = clone(prev);
  const p = s.seats[s.toAct];

  let type = action.type;
  if (type === 'check' && !o.canCheck) type = 'call';
  if (type === 'call' && o.toCall === 0) type = 'check';
  if (type === 'raise' && !o.canRaise) type = o.toCall ? 'call' : 'check';

  if (type === 'fold') {
    p.folded = true;
    note(s, `${says(p, 'fold', 'folds')}.`);
  } else if (type === 'check') {
    p.acted = true;
    note(s, `${says(p, 'check', 'checks')}.`);
  } else if (type === 'call') {
    putIn(p, o.toCall);
    p.acted = true;
    note(s, p.allIn ? `${says(p, 'call', 'calls')} all-in.` : `${says(p, 'call', 'calls')} ${o.toCall}.`);
  } else {
    const wanted = action.type === 'raise' ? action.to : o.minTo;
    const to = Math.max(o.minTo, Math.min(wanted, o.maxTo));
    const betting = s.currentBet === 0;
    putIn(p, to - p.bet);
    if (to - s.currentBet >= s.minRaise) s.minRaise = to - s.currentBet;
    if (to > s.currentBet) {
      s.currentBet = to;
      for (const q of s.seats) if (q !== p) q.acted = false;
    }
    p.acted = true;
    if (p.allIn) note(s, `${says(p, 'go', 'goes')} all-in (${to}).`);
    else note(s, betting ? `${says(p, 'bet', 'bets')} ${to}.` : `${says(p, 'raise', 'raises')} to ${to}.`);
  }
  return advance(s);
}

/** Moves to the next player, the next card or the showdown. */
function advance(s: PokerState): PokerState {
  const live = s.seats.filter(inHand);
  if (live.length === 1) {
    const winner = live[0];
    const amount = pot(s);
    winner.chips += amount;
    s.wins = [{ seat: s.seats.indexOf(winner), amount, hand: null }];
    s.toAct = -1;
    note(s, `${says(winner, 'win', 'wins')} ${amount}.`);
    return s;
  }

  const needsToAct = (p: Seat) => canAct(p) && (!p.acted || p.bet < s.currentBet);
  const actors = s.seats.filter(canAct);
  const roundOver = actors.every((p) => !needsToAct(p)) || (actors.length === 1 && actors[0].bet >= s.currentBet);
  if (!roundOver) {
    s.toAct = nextSeat(s, s.toAct, needsToAct);
    return s;
  }

  for (const p of s.seats) {
    p.bet = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = BIG_BLIND;
  if (s.street === 'river') return showdown(s);

  const next = ({ preflop: 'flop', flop: 'turn', turn: 'river' } as const)[s.street as 'preflop' | 'flop' | 'turn'];
  s.board.push(...s.deck.splice(-(next === 'flop' ? 3 : 1)));
  s.street = next;
  note(s, `${next[0].toUpperCase()}${next.slice(1)}: ${s.board.map(cardName).join(' ')}`);
  // Betting starts left of the dealer. If nobody can bet, the next card comes straight away.
  s.toAct = s.dealer;
  return advance(s);
}

function showdown(s: PokerState): PokerState {
  s.street = 'showdown';
  s.toAct = -1;
  const n = s.seats.length;
  const scores = s.seats.map((p) => (inHand(p) ? bestScore([...p.hole, ...s.board]) : null));
  const won = s.seats.map(() => 0);
  const announced = new Set<number>();
  // Seats in order from the dealer's left, for odd chips.
  const fromDealer = (i: number) => (i - s.dealer - 1 + n) % n;

  // Side pots: each level of chips is won by the best hand among those who put in that much.
  const levels = [...new Set(s.seats.map((p) => p.total).filter((t) => t > 0))].sort((a, b) => a - b);
  let floor = 0;
  for (const level of levels) {
    const amount = s.seats.reduce((sum, p) => sum + Math.max(0, Math.min(p.total, level) - floor), 0);
    const contributors = s.seats.filter((p) => p.total > floor).length;
    let eligible = s.seats.flatMap((p, i) => (scores[i] && p.total >= level ? [i] : []));
    if (!eligible.length) eligible = s.seats.flatMap((_, i) => (scores[i] ? [i] : []));
    const top = eligible.reduce((a, b) => (compareScores(scores[b]!, scores[a]!) > 0 ? b : a));
    const winners = eligible.filter((i) => compareScores(scores[i]!, scores[top]!) === 0).sort((a, b) => fromDealer(a) - fromDealer(b));
    const share = Math.floor(amount / winners.length);
    winners.forEach((i) => (won[i] += share));
    won[winners[0]] += amount - share * winners.length;
    // A level only one player paid into is their own unmatched bet coming back.
    if (contributors > 1) winners.forEach((i) => announced.add(i));
    floor = level;
  }

  s.seats.forEach((p, i) => (p.chips += won[i]));
  s.wins = [...announced].map((i) => ({ seat: i, amount: won[i], hand: handName(scores[i]!) }));
  for (const w of s.wins) note(s, `${says(s.seats[w.seat], 'win', 'wins')} ${w.amount} with ${w.hand?.toLowerCase()}.`);
  return s;
}

// ---------- computer players ----------

/** Rough chance of winning against the players still in the hand, by dealing random endings. */
export function winChance(s: PokerState, seat: number, rounds = 200, rand: () => number = Math.random): number {
  const me = s.seats[seat];
  const opponents = s.seats.filter((p, i) => i !== seat && inHand(p)).length;
  const known = new Set([...me.hole, ...s.board].map(cardName));
  const rest = shuffledDeck(rand).filter((c) => !known.has(cardName(c)));
  const missing = 5 - s.board.length;
  const need = missing + opponents * 2;
  let wins = 0;
  for (let r = 0; r < rounds; r++) {
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rand() * (rest.length - k));
      [rest[k], rest[j]] = [rest[j], rest[k]];
    }
    const board = [...s.board, ...rest.slice(0, missing)];
    const mine = bestScore([...me.hole, ...board]);
    let ties = 1;
    let lost = false;
    for (let o = 0; o < opponents && !lost; o++) {
      const at = missing + o * 2;
      const cmp = compareScores(bestScore([rest[at], rest[at + 1], ...board]), mine);
      if (cmp > 0) lost = true;
      else if (cmp === 0) ties++;
    }
    if (!lost) wins += 1 / ties;
  }
  return wins / rounds;
}

export function botAction(s: PokerState, rand: () => number = Math.random): Action {
  const o = options(s);
  const opponents = s.seats.filter((p, i) => i !== s.toAct && inHand(p)).length;
  const chance = winChance(s, s.toAct, 200, rand);
  /** 1 = an average hand at this table, 2 = twice as likely to win as average. */
  const strength = chance * (opponents + 1);
  const total = pot(s);
  const raiseTo = (fraction: number) => Math.round((s.currentBet + Math.max(s.minRaise, total * fraction)) / 10) * 10;
  const bluff = rand() < 0.08;
  const bigPot = s.currentBet >= BIG_BLIND * 8;

  if (o.toCall === 0) {
    if (o.canRaise && (strength > 1.5 || bluff)) return { type: 'raise', to: raiseTo(0.5 + rand() * 0.5) };
    return { type: 'check' };
  }
  // The share of the final pot that calling costs, loosened a little before the flop.
  const price = o.toCall / (total + o.toCall);
  if (chance < price * (s.street === 'preflop' ? 0.6 : 0.85) && !bluff) return { type: 'fold' };
  if (o.canRaise && strength > (bigPot ? 3 : 2) && rand() < 0.6) return { type: 'raise', to: raiseTo(0.6 + rand() * 0.6) };
  return { type: 'call' };
}