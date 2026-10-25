/**
 * Ludo rules, with no React: the board, legal moves, captures and a computer player.
 *
 * A token's progress counts squares from its colour's start square:
 * -1 = in its base, 0–50 = on the shared track, 51–55 = its own home column, 56 = home.
 */
export type Colour = 'red' | 'green' | 'yellow' | 'blue';
/** [row, column] on the 15 × 15 board. */
export type Point = [number, number];

export const COLOUR_NAME: Record<Colour, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
export const HOME = 56;

function line(r0: number, c0: number, r1: number, c1: number): Point[] {
  const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  return Array.from({ length: n + 1 }, (_, i): Point => [r0 + Math.sign(r1 - r0) * i, c0 + Math.sign(c1 - c0) * i]);
}

/** The 52 shared squares, clockwise. Red's start square is number 0. */
export const TRACK: Point[] = [
  ...line(6, 1, 6, 5),
  ...line(5, 6, 0, 6),
  ...line(0, 7, 0, 8),
  ...line(1, 8, 5, 8),
  ...line(6, 9, 6, 14),
  ...line(7, 14, 8, 14),
  ...line(8, 13, 8, 9),
  ...line(9, 8, 14, 8),
  ...line(14, 7, 14, 6),
  ...line(13, 6, 9, 6),
  ...line(8, 5, 8, 0),
  ...line(7, 0, 6, 0),
];

export const START: Record<Colour, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
/** Start squares and star squares: tokens there can't be captured. */
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const HOME_COLUMN: Record<Colour, Point[]> = {
  red: line(7, 1, 7, 5),
  green: line(1, 7, 5, 7),
  yellow: line(7, 13, 7, 9),
  blue: line(13, 7, 9, 7),
};
const BASE_CORNER: Record<Colour, Point> = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
const HOME_SIDE: Record<Colour, Point> = { red: [0, -1], green: [-1, 0], yellow: [0, 1], blue: [1, 0] };

export interface LudoState {
  /** Turn order, clockwise. players[0] is you. */
  players: Colour[];
  tokens: Record<Colour, number[]>;
  turn: number;
  /** The roll waiting to be used, or null before rolling. */
  dice: number | null;
  winner: Colour | null;
  message: string;
}

export function newLudo(computers: 1 | 3): LudoState {
  const players: Colour[] = computers === 1 ? ['red', 'yellow'] : ['red', 'green', 'yellow', 'blue'];
  const base = () => [-1, -1, -1, -1];
  return {
    players,
    tokens: { red: base(), green: base(), yellow: base(), blue: base() },
    turn: 0,
    dice: null,
    winner: null,
    message: 'You are red. Roll a 6 to bring a token out.',
  };
}

export const current = (s: LudoState) => s.players[s.turn];
const who = (s: LudoState, c: Colour) => (c === s.players[0] ? 'You' : COLOUR_NAME[c]);

/** Shared-track square (0–51) for a progress of 0–50. */
export const square = (c: Colour, progress: number) => (START[c] + progress) % 52;

/** Tokens of the current player that can use the dice. */
export function movable(s: LudoState): number[] {
  const d = s.dice;
  if (d === null || s.winner) return [];
  return s.tokens[current(s)].flatMap((p, i) => ((p === -1 ? d === 6 : p + d <= HOME) ? [i] : []));
}

export function roll(s: LudoState, value: number): LudoState {
  const next = { ...s, dice: value };
  const none = movable(next).length === 0;
  return { ...next, message: `${who(s, current(s))} rolled ${value}.${none ? ' No move possible.' : ''}` };
}

/** Hands the dice to the next player. */
export function pass(s: LudoState): LudoState {
  return { ...s, turn: (s.turn + 1) % s.players.length, dice: null };
}

export function move(s: LudoState, token: number): LudoState {
  const c = current(s);
  const d = s.dice;
  if (d === null || !movable(s).includes(token)) return s;

  const tokens = { ...s.tokens, [c]: [...s.tokens[c]] };
  const from = tokens[c][token];
  const to = from === -1 ? 0 : from + d;
  tokens[c][token] = to;

  // Landing on other colours' tokens sends them back to base, except on safe squares.
  const victims: Colour[] = [];
  if (to <= 50 && !SAFE.has(square(c, to))) {
    const here = square(c, to);
    const onHere = (o: Colour, p: number) => p >= 0 && p <= 50 && square(o, p) === here;
    for (const o of s.players) {
      if (o === c || !tokens[o].some((p) => onHere(o, p))) continue;
      victims.push(o);
      tokens[o] = tokens[o].map((p) => (onHere(o, p) ? -1 : p));
    }
  }

  const name = who(s, c);
  let message = from === -1 ? `${name} brought a token out.` : `${name} moved ${d}.`;
  if (victims.length) message = `${name} sent ${victims.map((v) => (v === s.players[0] ? 'you' : COLOUR_NAME[v])).join(' and ')} back to base!`;
  if (to === HOME) message = `${name} got a token home.`;

  if (tokens[c].every((p) => p === HOME)) {
    return { ...s, tokens, dice: null, winner: c, message: c === s.players[0] ? 'You win! All four tokens are home.' : `${COLOUR_NAME[c]} wins.` };
  }
  // A 6 or a capture earns another roll.
  if (d === 6 || victims.length) return { ...s, tokens, dice: null, message: `${message} Roll again.` };
  return pass({ ...s, tokens, message });
}

/** True if another colour's token is 1–6 squares behind this square and could land on it. */
function threatened(s: LudoState, c: Colour, sq: number): boolean {
  return s.players.some(
    (o) =>
      o !== c &&
      s.tokens[o].some((p) => {
        if (p < 0 || p > 50) return false;
        const gap = (sq - square(o, p) + 52) % 52;
        return gap >= 1 && gap <= 6 && p + gap <= 50;
      }),
  );
}

/** The computer's choice: capture, get home, leave base, reach safety, avoid danger. */
export function chooseMove(s: LudoState, rand: () => number = Math.random): number {
  const c = current(s);
  const d = s.dice ?? 0;
  let best = -1;
  let bestScore = -Infinity;
  for (const i of movable(s)) {
    const from = s.tokens[c][i];
    const to = from === -1 ? 0 : from + d;
    let score = to * 0.2 + rand() * 3;
    if (from === -1) score += 40;
    if (to === HOME) score += 60;
    else if (to > 50 && from <= 50) score += 25;
    if (to <= 50) {
      const sq = square(c, to);
      const captures = s.players.some((o) => o !== c && s.tokens[o].some((p) => p >= 0 && p <= 50 && square(o, p) === sq));
      if (SAFE.has(sq)) score += 15;
      else {
        if (captures) score += 80;
        if (threatened(s, c, sq)) score -= 35;
      }
    }
    if (from >= 0 && from <= 50 && !SAFE.has(square(c, from)) && threatened(s, c, square(c, from))) score += 20;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Where to draw a token, in board squares (fractions allowed). */
export function tokenPoint(c: Colour, progress: number, index: number): Point {
  if (progress === -1) {
    const [r, col] = BASE_CORNER[c];
    return [r + (index < 2 ? 2 : 4), col + (index % 2 ? 4 : 2)];
  }
  if (progress === HOME) {
    const [dr, dc] = HOME_SIDE[c];
    const spread = (index - 1.5) * 0.38;
    return [7.5 + dr * 0.8 + dc * spread, 7.5 + dc * 0.8 + dr * spread];
  }
  const [r, col] = progress <= 50 ? TRACK[square(c, progress)] : HOME_COLUMN[c][progress - 51];
  return [r + 0.5, col + 0.5];
}