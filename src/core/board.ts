/**
 * 棋盘算法：访问器 + 布雷 + 迭代式展开（plan §4.2 / §4.3）
 *
 * 本文件不得引用任何 DOM API（章程 C1 / NFR-03），也不得调用 Math.random()（NFR-04）。
 */
import type { Board, Cell, Coord } from './types.js';
import { createRng, shuffle } from './rng.js';

/** 默认（未翻开、无标记）单元格 */
const EMPTY_CELL: Cell = {
  isMine: false,
  isRevealed: false,
  mark: 'none',
  adjacent: 0,
};

/** 8 邻域偏移量 */
const NEIGHBOR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function isNonNegativeInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** 坐标是否落在棋盘内 */
export function inBounds(board: Board, r: number, c: number): boolean {
  if (!isNonNegativeInt(r) || !isNonNegativeInt(c)) {
    return false;
  }
  const row = board[r];
  return row !== undefined && c < row.length;
}

/** 安全访问器：越界返回 undefined（配合 noUncheckedIndexedAccess，ADR-07） */
export function getCell(board: Board, r: number, c: number): Cell | undefined {
  if (!inBounds(board, r, c)) {
    return undefined;
  }
  const row = board[r];
  return row === undefined ? undefined : row[c];
}

/** 遍历 (r, c) 在棋盘内的 8 邻域 */
export function forEachNeighbor(
  board: Board,
  r: number,
  c: number,
  visit: (cell: Cell, nr: number, nc: number) => void,
): void {
  for (const [dr, dc] of NEIGHBOR_OFFSETS) {
    const nr = r + dr;
    const nc = c + dc;
    const cell = getCell(board, nr, nc);
    if (cell !== undefined) {
      visit(cell, nr, nc);
    }
  }
}

/** 统计 (r, c) 8 邻域内的地雷数量（FR-06） */
export function countAdjacentMines(board: Board, r: number, c: number): number {
  let count = 0;
  forEachNeighbor(board, r, c, (cell) => {
    if (cell.isMine) {
      count += 1;
    }
  });
  return count;
}

/** 构造全空的 rows × cols 棋盘 */
export function createEmptyGrid(rows: number, cols: number): Board {
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c += 1) {
      row.push(EMPTY_CELL);
    }
    grid.push(row);
  }
  return grid;
}

/** 首击安全区（首击格自身 + 其 8 邻域，裁剪到棋盘内），返回扁平索引数组 */
function safeZoneIndices(rows: number, cols: number, first: Coord): number[] {
  const indices: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const r = first.r + dr;
      const c = first.c + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        indices.push(r * cols + c);
      }
    }
  }
  return indices;
}

/**
 * 选取要布雷的扁平索引（FR-07）。
 *
 * 策略优先级：
 *   1. 安全区之外的格子（正常路径）
 *   2. 退化：只豁免首击格自身，其余格子均可布雷（FR-07 步骤 5 / EC-14）
 *
 * 注：策略 2 必然足够 —— 其候选数为 total − 1，而前置条件保证 mineCount ≤ total − 1，
 * 因此不存在「仍需第三层兜底」的可达路径（第三层兜底已按此证明删除）。
 * 首击格在两层策略中都被排除，故 I2（首击格非雷）恒成立。
 */
function pickMineIndices(
  rows: number,
  cols: number,
  mineCount: number,
  first: Coord,
  rand: () => number,
): number[] {
  const total = rows * cols;
  const firstIndex = first.r * cols + first.c;
  const safeZone = new Set(safeZoneIndices(rows, cols, first));

  const build = (excluded: ReadonlySet<number>): number[] => {
    const out: number[] = [];
    for (let i = 0; i < total; i += 1) {
      if (!excluded.has(i)) {
        out.push(i);
      }
    }
    return out;
  };

  let candidates = build(safeZone);
  if (candidates.length < mineCount) {
    candidates = build(new Set<number>([firstIndex]));
  }

  return shuffle(candidates, rand).slice(0, mineCount);
}

/**
 * 布雷并计算全部相邻雷数（FR-07 / FR-06）。
 *
 * 保证（不变量，见 plan §4.2）：
 *   I1 count(isMine) === mineCount
 *   I2 board[first.r][first.c].isMine === false
 *   I3 非退化时安全区内无雷
 *   I4 ∀ 非雷格 0 ≤ adjacent ≤ 8
 *   I5 ∀ 非雷格 adjacent === 8 邻域真实雷数
 */
export function layMines(
  rows: number,
  cols: number,
  mineCount: number,
  first: Coord,
  seed: number,
): Board {
  const total = rows * cols;
  if (mineCount > total - 1) {
    throw new Error(
      `mineCount (${mineCount}) must leave at least one safe cell out of ${total}`,
    );
  }

  const rand = createRng(seed);
  const mined = new Set(pickMineIndices(rows, cols, mineCount, first, rand));

  const worked: Cell[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c += 1) {
      row.push({ ...EMPTY_CELL, isMine: mined.has(r * cols + c) });
    }
    worked.push(row);
  }

  // 第二遍：在雷分布确定后计算相邻雷数
  for (let r = 0; r < rows; r += 1) {
    const row = worked[r];
    if (row === undefined) {
      continue;
    }
    for (let c = 0; c < cols; c += 1) {
      const cell = row[c];
      if (cell === undefined || cell.isMine) {
        continue;
      }
      row[c] = { ...cell, adjacent: countAdjacentMines(worked, r, c) };
    }
  }

  return worked;
}