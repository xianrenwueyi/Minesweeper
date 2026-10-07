/**
 * 迭代式空白区展开（FR-05 / NFR-02，plan §4.3）
 *
 * 从 board.ts 拆分而来，以满足 NFR-07（单文件 ≤ 250 行）。
 * 本文件不得引用任何 DOM API（章程 C1 / NFR-03）。
 */
import type { Board, Cell, Coord } from './types.js';
import { inBounds } from './board.js';

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

/**
 * 展开起点及其邻域，返回新棋盘与「本次新翻开的格数」。
 *
 * 语义保证（对应 AC-A14 ~ AC-A18）：
 * - 使用显式栈，绝不递归，避免深展开栈溢出（NFR-02）
 * - 不翻开任何地雷；地雷不入栈，是展开的天然屏障
 * - 被展开的格子其 flag / question 标记被清除（FR-05 / EC-06）
 * - 展开在 adjacent ≠ 0 的格子处止步（只翻开边界层，不再向外扩散）
 * - 返回新棋盘，不修改入参（章程 C2）
 * - 起始坐标越界时原样返回入参对象
 */
export function floodFill(
  board: Board,
  start: Coord,
): { readonly board: Board; readonly revealed: number } {
  if (!inBounds(board, start.r, start.c)) {
    return { board, revealed: 0 };
  }

  const rows = board.length;
  const startRow = board[start.r];
  const cols = startRow === undefined ? 0 : startRow.length;

  // 浅拷贝每一行：写入 row[c] 时不会影响入参的 Cell 对象或行数组
  const next = board.map((row) => row.map((cell) => cell)) as Cell[][];
  const visited = new Set<number>();
  const stack: Coord[] = [start];
  let revealed = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }

    // visited 保证每格最多被处理一次，展开因此必然收敛
    const index = current.r * cols + current.c;
    if (visited.has(index)) {
      continue;
    }
    visited.add(index);

    const row = next[current.r];
    const cell = row === undefined ? undefined : row[current.c];
    if (row === undefined || cell === undefined || cell.isMine) {
      continue;
    }

    if (!cell.isRevealed) {
      row[current.c] = { ...cell, isRevealed: true, mark: 'none' };
      revealed += 1;
    }

    if (cell.adjacent !== 0) {
      continue;
    }

    for (const [dr, dc] of NEIGHBOR_OFFSETS) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
        continue;
      }
      const neighborRow = next[nr];
      const neighbor = neighborRow === undefined ? undefined : neighborRow[nc];
      if (neighbor === undefined || neighbor.isMine || neighbor.isRevealed) {
        continue;
      }
      stack.push({ r: nr, c: nc });
    }
  }

  return { board: next, revealed };
}
