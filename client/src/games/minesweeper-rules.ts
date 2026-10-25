/**
 * Minesweeper rules, with no React: laying mines, opening squares and flags.
 * Mines are laid on the first click, away from it, so the first click is always safe.
 */
export interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  /** Mines in the 8 squares around this one. */
  near: number;
}

export type Status = 'ready' | 'playing' | 'won' | 'lost';

export interface Board {
  rows: number;
  cols: number;
  mines: number;
  cells: Cell[];
  status: Status;
  /** The mine that went off, when lost. */
  boom: number | null;
}

export const LEVELS = {
  easy: { label: 'Easy', rows: 9, cols: 9, mines: 10 },
  medium: { label: 'Medium', rows: 12, cols: 12, mines: 24 },
  hard: { label: 'Hard', rows: 16, cols: 16, mines: 40 },
};
export type Level = keyof typeof LEVELS;

export function newBoard(level: Level): Board {
  const { rows, cols, mines } = LEVELS[level];
  const cells = Array.from({ length: rows * cols }, () => ({ mine: false, open: false, flag: false, near: 0 }));
  return { rows, cols, mines, cells, status: 'ready', boom: null };
}

export function neighbours(b: Board, i: number): number[] {
  const r = Math.floor(i / b.cols);
  const c = i % b.cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if ((dr || dc) && nr >= 0 && nr < b.rows && nc >= 0 && nc < b.cols) out.push(nr * b.cols + nc);
    }
  }
  return out;
}

function layMines(b: Board, safe: number, rand: () => number): Cell[] {
  const keepClear = new Set([safe, ...neighbours(b, safe)]);
  const spots = b.cells.map((_, i) => i).filter((i) => !keepClear.has(i));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const mines = new Set(spots.slice(0, b.mines));
  return b.cells.map((cell, i) => ({
    ...cell,
    mine: mines.has(i),
    near: neighbours(b, i).filter((n) => mines.has(n)).length,
  }));
}

/** Opens a square. Empty squares open their neighbours too. */
export function reveal(b: Board, i: number, rand: () => number = Math.random): Board {
  if (b.status === 'won' || b.status === 'lost' || b.cells[i].open || b.cells[i].flag) return b;
  const cells = b.status === 'ready' ? layMines(b, i, rand) : b.cells.map((c) => ({ ...c }));

  if (cells[i].mine) {
    cells.forEach((c) => {
      if (c.mine) c.open = true;
    });
    return { ...b, cells, status: 'lost', boom: i };
  }

  const stack = [i];
  while (stack.length) {
    const j = stack.pop()!;
    const c = cells[j];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.near === 0) stack.push(...neighbours(b, j));
  }

  const won = cells.every((c) => c.mine || c.open);
  if (won) cells.forEach((c) => (c.flag = c.mine));
  return { ...b, cells, status: won ? 'won' : 'playing' };
}

/** Clicking an open number with that many flags around it opens the other neighbours. */
export function chord(b: Board, i: number): Board {
  const c = b.cells[i];
  if (b.status !== 'playing' || !c.open || c.near === 0) return b;
  const around = neighbours(b, i);
  if (around.filter((n) => b.cells[n].flag).length !== c.near) return b;
  return around.reduce((board, n) => reveal(board, n), b);
}

export function toggleFlag(b: Board, i: number): Board {
  if (b.status === 'won' || b.status === 'lost' || b.cells[i].open) return b;
  const cells = b.cells.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c));
  return { ...b, cells };
}

export const flagsLeft = (b: Board) => b.mines - b.cells.filter((c) => c.flag).length;