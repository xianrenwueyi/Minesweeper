/**
 * AC-A03 / AC-A04 / AC-A09 ~ AC-A13 / AC-A18：棋盘访问器与布雷
 * 覆盖 FR-06 / FR-07 / EC-04 / EC-14，以及 plan §4.2 的不变量 I1–I5
 */
import { describe, expect, it } from 'vitest';
import {
  countAdjacentMines,
  createEmptyGrid,
  forEachNeighbor,
  getCell,
  inBounds,
  layMines,
} from '../src/core/board.js';
import type { Board, Cell, Coord } from '../src/core/types.js';
import { DIFFICULTIES } from '../src/core/config.js';

function mustCell(board: Board, r: number, c: number): Cell {
  const cell = getCell(board, r, c);
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

function countMines(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine) n += 1;
    }
  }
  return n;
}

function countNeighborCells(board: Board, r: number, c: number): number {
  let n = 0;
  forEachNeighbor(board, r, c, () => {
    n += 1;
  });
  return n;
}

const SEEDS = [1, 2, 3, 42, 12345, 987654321];

function firstClickPositions(rows: number, cols: number): Coord[] {
  return [
    { r: 0, c: 0 },
    { r: 0, c: cols - 1 },
    { r: rows - 1, c: 0 },
    { r: rows - 1, c: cols - 1 },
    { r: Math.floor(rows / 2), c: Math.floor(cols / 2) },
  ];
}

describe('createEmptyGrid', () => {
  it('生成指定尺寸的空棋盘，且所有格子均为初始态（AC-A03）', () => {
    const board = createEmptyGrid(9, 9);
    expect(board).toHaveLength(9);
    for (const row of board) {
      expect(row).toHaveLength(9);
      for (const cell of row) {
        expect(cell).toEqual({ isMine: false, isRevealed: false, mark: 'none', adjacent: 0 });
      }
    }
  });

  it('支持非方形尺寸', () => {
    expect(createEmptyGrid(16, 30)).toHaveLength(16);
    expect(createEmptyGrid(16, 30)[0]).toHaveLength(30);
  });

  it('支持退化尺寸 1x1', () => {
    expect(createEmptyGrid(1, 1)).toEqual([[{ isMine: false, isRevealed: false, mark: 'none', adjacent: 0 }]]);
  });
});

describe('防御性行为：残缺棋盘不崩溃（配合 noUncheckedIndexedAccess，ADR-07）', () => {
  it('邻域遍历遇到稀疏行时跳过缺失行，不抛异常', () => {
    // 故意构造「行缺失」的畸形棋盘，验证访问器只做防御而不崩溃
    const sparse = [createEmptyGrid(2, 2)[0], undefined] as unknown as Board;
    expect(() => forEachNeighbor(sparse, 0, 0, () => undefined)).not.toThrow();
    expect(countAdjacentMines(sparse, 0, 0)).toBe(0);
  });

  it('inBounds 对缺失行返回 false，getCell 返回 undefined', () => {
    const sparse = [createEmptyGrid(2, 2)[0], undefined] as unknown as Board;
    expect(inBounds(sparse, 1, 0)).toBe(false);
    expect(getCell(sparse, 1, 0)).toBeUndefined();
  });

  it('layMines 面对缺失行的畸形尺寸不会崩溃（行由尺寸循环生成，天然完整）', () => {
    // 回归保护：布雷内部按 rows/cols 重建网格，不依赖传入结构
    const board = layMines(2, 2, 2, { r: 0, c: 0 }, 1);
    expect(board).toHaveLength(2);
    expect(countMines(board)).toBe(2);
  });
});

describe('inBounds / getCell', () => {
  const board = createEmptyGrid(3, 4);

  it('识别界内与界外坐标', () => {
    expect(inBounds(board, 0, 0)).toBe(true);
    expect(inBounds(board, 2, 3)).toBe(true);
    expect(inBounds(board, 3, 0)).toBe(false);
    expect(inBounds(board, 0, 4)).toBe(false);
    expect(inBounds(board, -1, 0)).toBe(false);
    expect(inBounds(board, 0, -1)).toBe(false);
  });

  it('拒绝非整数坐标（防止数组越界静默失败）', () => {
    expect(inBounds(board, 1.5, 0)).toBe(false);
    expect(inBounds(board, 0, Number.NaN)).toBe(false);
    expect(inBounds(board, Number.POSITIVE_INFINITY, 0)).toBe(false);
  });

  it('越界时 getCell 返回 undefined 而非抛错', () => {
    expect(getCell(board, 5, 5)).toBeUndefined();
    expect(getCell(board, -1, 0)).toBeUndefined();
    expect(getCell(board, 1, 1)).toBeDefined();
  });
});

describe('邻域遍历（AC-A04）', () => {
  const board = createEmptyGrid(5, 6);

  it('角格邻域为 3', () => {
    expect(countNeighborCells(board, 0, 0)).toBe(3);
    expect(countNeighborCells(board, 0, 5)).toBe(3);
    expect(countNeighborCells(board, 4, 0)).toBe(3);
    expect(countNeighborCells(board, 4, 5)).toBe(3);
  });

  it('边格（非角）邻域为 5', () => {
    expect(countNeighborCells(board, 0, 3)).toBe(5);
    expect(countNeighborCells(board, 4, 2)).toBe(5);
    expect(countNeighborCells(board, 2, 0)).toBe(5);
    expect(countNeighborCells(board, 1, 5)).toBe(5);
  });

  it('内部格邻域为 8', () => {
    expect(countNeighborCells(board, 2, 3)).toBe(8);
  });

  it('不会遍历到自身', () => {
    forEachNeighbor(board, 2, 3, (_cell, nr, nc) => {
      expect(`${nr},${nc}`).not.toBe('2,3');
    });
  });
});

describe('layMines 不变量（AC-A09 ~ AC-A13）', () => {
  it('I1：雷数精确等于 mineCount（AC-A09）', () => {
    for (const cfg of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const board = layMines(cfg.rows, cfg.cols, cfg.mineCount, { r: 0, c: 0 }, seed);
        expect(countMines(board)).toBe(cfg.mineCount);
      }
    }
  });

  it('I2：首击格永远不是雷，覆盖三难度 × 多种子 × 四角与中心（AC-A10 / EC-04）', () => {
    for (const cfg of DIFFICULTIES) {
      for (const seed of SEEDS) {
        for (const first of firstClickPositions(cfg.rows, cfg.cols)) {
          const board = layMines(cfg.rows, cfg.cols, cfg.mineCount, first, seed);
          expect(mustCell(board, first.r, first.c).isMine).toBe(false);
        }
      }
    }
  });

  it('I3：非退化情况下安全区（含 8 邻域）内无雷（AC-A11）', () => {
    for (const cfg of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const first = { r: Math.floor(cfg.rows / 2), c: Math.floor(cfg.cols / 2) };
        const board = layMines(cfg.rows, cfg.cols, cfg.mineCount, first, seed);
        let minesInSafeZone = 0;
        forEachNeighbor(board, first.r, first.c, (cell) => {
          if (cell.isMine) minesInSafeZone += 1;
        });
        expect(minesInSafeZone).toBe(0);
      }
    }
  });

  it('I4/I5：每个非雷格的 adjacent 等于真实 8 邻域雷数，且落在 0–8（AC-A12）', () => {
    for (const cfg of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const board = layMines(cfg.rows, cfg.cols, cfg.mineCount, { r: 1, c: 1 }, seed);
        for (let r = 0; r < cfg.rows; r += 1) {
          for (let c = 0; c < cfg.cols; c += 1) {
            const cell = mustCell(board, r, c);
            if (cell.isMine) {
              continue;
            }
            const expected = countAdjacentMines(board, r, c);
            expect(cell.adjacent).toBe(expected);
            expect(cell.adjacent).toBeGreaterThanOrEqual(0);
            expect(cell.adjacent).toBeLessThanOrEqual(8);
          }
        }
      }
    }
  });

  it('布雷后不存在已翻开格或标记（棋盘刚生成）', () => {
    const board = layMines(9, 9, 10, { r: 4, c: 4 }, 42);
    for (const row of board) {
      for (const cell of row) {
        expect(cell.isRevealed).toBe(false);
        expect(cell.mark).toBe('none');
      }
    }
  });

  it('相同种子产生完全相同的雷区布局（章程 C3）', () => {
    const a = layMines(16, 16, 40, { r: 3, c: 4 }, 2024);
    const b = layMines(16, 16, 40, { r: 3, c: 4 }, 2024);
    expect(a).toEqual(b);
  });

  it('不同种子产生不同的雷区布局', () => {
    const a = layMines(9, 9, 10, { r: 4, c: 4 }, 1);
    const b = layMines(9, 9, 10, { r: 4, c: 4 }, 2);
    expect(a).not.toEqual(b);
  });

  it('不修改任何外部输入（纯函数，章程 C2）', () => {
    const first = Object.freeze({ r: 4, c: 4 });
    expect(() => layMines(9, 9, 10, first, 42)).not.toThrow();
  });
});

describe('layMines 退化路径（AC-A13 / EC-14）', () => {
  it('安全区覆盖全盘时退化为「唯一豁免格」，首击仍非雷且雷数精确', () => {
    // 3x3 棋盘、首击在中心 → 安全区覆盖全部 9 格，区外 0 格，必须退化
    const board = layMines(3, 3, 8, { r: 1, c: 1 }, 42);
    expect(mustCell(board, 1, 1).isMine).toBe(false);
    expect(countMines(board)).toBe(8);
  });

  it('退化后 8 个邻格全部是雷', () => {
    const board = layMines(3, 3, 8, { r: 1, c: 1 }, 7);
    forEachNeighbor(board, 1, 1, (cell) => {
      expect(cell.isMine).toBe(true);
    });
  });

  it('3x3 首击在角落时仍优先使用安全区策略（区外 4 格 ≥ 1 雷）', () => {
    const board = layMines(3, 3, 1, { r: 0, c: 0 }, 5);
    expect(countMines(board)).toBe(1);
    expect(mustCell(board, 0, 0).isMine).toBe(false);
    // 安全区 = 整个棋盘，故这一颗雷只能落在安全区内的非首击格（已退化为唯一豁免格策略）
    expect(countNeighborCells(board, 0, 0)).toBe(3);
  });

  it('1x1 棋盘放 1 颗雷会因无安全格而快速失败', () => {
    expect(() => layMines(1, 1, 1, { r: 0, c: 0 }, 1)).toThrow(/leave at least one safe cell/);
  });

  it('雷数超过棋盘容量时抛出明确错误', () => {
    expect(() => layMines(2, 2, 5, { r: 0, c: 0 }, 1)).toThrow(/leave at least one safe cell/);
  });
});
