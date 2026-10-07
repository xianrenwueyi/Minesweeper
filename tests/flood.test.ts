/**
 * AC-A14 ~ AC-A18：迭代式空白区展开（FR-05 / NFR-02 / EC-06）
 * 以及 AC-A27 的「不修改入参」性质
 */
import { describe, expect, it } from 'vitest';
import { countAdjacentMines, getCell, layMines } from '../src/core/board.js';
import { floodFill } from '../src/core/flood.js';
import type { Board, Cell } from '../src/core/types.js';
import { DIFFICULTIES } from '../src/core/config.js';

function cellAt(board: Board, r: number, c: number): Cell {
  const cell = getCell(board, r, c);
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

/** 从字符串图构造棋盘：'.' 非雷，'*' 地雷。adjacent 由真实雷分布计算。 */
function parseBoard(rows: readonly string[]): Board {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const base: Cell[][] = [];
  for (let r = 0; r < height; r += 1) {
    const line = rows[r] ?? '';
    const row: Cell[] = [];
    for (let c = 0; c < width; c += 1) {
      row.push({ isMine: line[c] === '*', isRevealed: false, mark: 'none', adjacent: 0 });
    }
    base.push(row);
  }
  return base.map((row, r) => row.map((cell, c) => ({ ...cell, adjacent: countAdjacentMines(base, r, c) })));
}

function countRevealed(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isRevealed) n += 1;
    }
  }
  return n;
}

function countMinesRevealed(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine && cell.isRevealed) n += 1;
    }
  }
  return n;
}

describe('floodFill 边界与退出条件', () => {
  it('越界起始坐标返回原棋盘且 revealed 为 0', () => {
    const board = parseBoard(['....', '....']);
    const result = floodFill(board, { r: 9, c: 9 });
    expect(result.revealed).toBe(0);
    expect(result.board).toBe(board);
  });

  it('起始格已有相邻雷数时只翻开这一格（FR-05 边界层）', () => {
    const board = parseBoard(['*..', '...', '...']);
    const result = floodFill(board, { r: 0, c: 1 });
    expect(result.revealed).toBe(1);
    expect(cellAt(result.board, 0, 1).isRevealed).toBe(true);
    expect(cellAt(result.board, 0, 2).isRevealed).toBe(false);
  });

  it('对已翻开的格子调用返回 revealed 为 0（幂等，EC-12 同源性质）', () => {
    const board = parseBoard(['...', '...', '...']);
    const first = floodFill(board, { r: 1, c: 1 });
    expect(first.revealed).toBe(9);
    const again = floodFill(first.board, { r: 1, c: 1 });
    expect(again.revealed).toBe(0);
  });
});

describe('floodFill 展开正确性（AC-A14）', () => {
  it('全空棋盘从中心展开会翻开全部 9 格', () => {
    const result = floodFill(parseBoard(['...', '...', '...']), { r: 1, c: 1 });
    expect(result.revealed).toBe(9);
    expect(countRevealed(result.board)).toBe(9);
  });

  it('从角落展开也会覆盖全盘（邻域裁剪到棋盘内，EC-04）', () => {
    const result = floodFill(parseBoard(['...', '...', '...']), { r: 0, c: 0 });
    expect(countRevealed(result.board)).toBe(9);
  });

  it('被地雷围住的数字格只展开 1 格', () => {
    // 图中地雷位于 (0,0) (0,2) (2,0) (2,2)。
    // (0,1) 的 8 邻域内只有 (0,0) 与 (0,2) 两个雷 → adjacent = 2 ≠ 0 → 展开在自身止步
    const board = parseBoard(['*.*', '...', '*.*']);
    expect(cellAt(board, 0, 1).adjacent).toBe(2);
    const result = floodFill(board, { r: 0, c: 1 });
    expect(result.revealed).toBe(1);
    expect(countMinesRevealed(result.board)).toBe(0);
    expect(cellAt(result.board, 0, 1).isRevealed).toBe(true);
    // adjacent ≠ 0，因此不会带出任何邻格
    expect(cellAt(result.board, 1, 0).isRevealed).toBe(false);
    expect(cellAt(result.board, 1, 1).isRevealed).toBe(false);
    expect(cellAt(result.board, 1, 2).isRevealed).toBe(false);
  });

  it('adjacent 为 0 的格子会带出全部邻域空格，但不越过地雷', () => {
    // 图中唯一地雷在中心 (1,1)。(0,0) 的对角正是该雷 → adjacent = 1（数字格）
    const digit = parseBoard(['...', '.*.', '...']);
    expect(cellAt(digit, 0, 0).adjacent).toBe(1);
    expect(floodFill(digit, { r: 0, c: 0 }).revealed).toBe(1);

    // 中心为雷时没有 adjacent = 0 的格子，因此改用「雷在角落」的图：
    // (0,0) 为雷，其余 8 格相邻雷数均为 1，从 (1,2) 展开同样只翻开自身
    const corner = parseBoard(['*..', '...', '...']);
    const result = floodFill(corner, { r: 2, c: 2 });
    expect(cellAt(corner, 2, 2).adjacent).toBe(0);
    // (2,2) 的邻域全是非雷格，因此整盘除左上角地雷外全部被翻开
    expect(result.revealed).toBe(8);
    expect(countMinesRevealed(result.board)).toBe(0);
    expect(cellAt(result.board, 0, 0).isRevealed).toBe(false);
  });

  it('连通的两个 0 区会被一并展开，并带出其边界层', () => {
    const board = parseBoard(['.....', '.....', '..*..', '.....', '.....']);
    const result = floodFill(board, { r: 0, c: 0 });
    // 除中心地雷外全部翻开
    expect(result.revealed).toBe(24);
    expect(cellAt(result.board, 2, 2).isRevealed).toBe(false);
  });

  it('边界层数字格会被翻开但不再向外扩散', () => {
    // 左列全空，右列为雷；从 (0,0) 展开应翻开左列 3 格 + 中列 3 格，不翻开右列
    const board = parseBoard(['..*', '..*', '..*']);
    const result = floodFill(board, { r: 0, c: 0 });
    expect(countRevealed(result.board)).toBe(6);
    for (let r = 0; r < 3; r += 1) {
      expect(cellAt(result.board, r, 0).isRevealed).toBe(true);
      expect(cellAt(result.board, r, 1).isRevealed).toBe(true);
      expect(cellAt(result.board, r, 2).isRevealed).toBe(false);
    }
  });

  it('不翻开任何地雷（AC-A15）', () => {
    for (const cfg of DIFFICULTIES) {
      for (const seed of [3, 17, 2024]) {
        const board = layMines(cfg.rows, cfg.cols, cfg.mineCount, { r: 0, c: 0 }, seed);
        const result = floodFill(board, { r: 0, c: 0 });
        expect(countMinesRevealed(result.board)).toBe(0);
      }
    }
  });

  it('大棋盘上展开的每格 adjacent 与真实雷数一致（展开未破坏数据）', () => {
    const board = layMines(16, 16, 40, { r: 5, c: 5 }, 2024);
    const result = floodFill(board, { r: 5, c: 5 });
    for (let r = 0; r < 16; r += 1) {
      for (let c = 0; c < 16; c += 1) {
        const cell = cellAt(result.board, r, c);
        if (!cell.isMine) {
          expect(cell.adjacent).toBe(countAdjacentMines(result.board, r, c));
        }
      }
    }
  });
});

describe('floodFill 清除标记（AC-A16 / EC-06）', () => {
  it('展开波覆盖到的旗子会被翻开且标记被清除', () => {
    const board = parseBoard(['...', '...', '...']);
    // 手工给中心格以外的格子加标记，制造「展开波覆盖已标旗格」的场景
    const marked: Cell[][] = board.map((row) => row.map((cell) => ({ ...cell })));
    const targetRow = marked[0];
    if (targetRow !== undefined) {
      const flagged = targetRow[0];
      if (flagged !== undefined) targetRow[0] = { ...flagged, mark: 'flag' };
      const questioned = targetRow[2];
      if (questioned !== undefined) targetRow[2] = { ...questioned, mark: 'question' };
    }

    const result = floodFill(marked, { r: 1, c: 1 });
    expect(cellAt(result.board, 0, 0)).toEqual({
      isMine: false,
      isRevealed: true,
      mark: 'none',
      adjacent: 0,
    });
    expect(cellAt(result.board, 0, 2).mark).toBe('none');
    expect(cellAt(result.board, 0, 2).isRevealed).toBe(true);
  });
});

describe('floodFill 不可变性（AC-A18 / 章程 C2）', () => {
  it('不修改传入的棋盘', () => {
    const board = parseBoard(['...', '...', '...']);
    const snapshot = JSON.parse(JSON.stringify(board)) as unknown;
    floodFill(board, { r: 1, c: 1 });
    expect(JSON.parse(JSON.stringify(board))).toEqual(snapshot);
  });

  it('冻结的棋盘也能安全处理（不会就地写入）', () => {
    const board = parseBoard(['...', '...', '...']);
    const frozen: Board = Object.freeze(board.map((row) => Object.freeze(row)));
    expect(() => floodFill(frozen, { r: 1, c: 1 })).not.toThrow();
  });

  it('返回的是新棋盘对象', () => {
    const board = parseBoard(['...', '...', '...']);
    expect(floodFill(board, { r: 1, c: 1 }).board).not.toBe(board);
  });
});

describe('floodFill 迭代实现与性能（AC-A17 / NFR-02 / NFR-01）', () => {
  it('最大内置棋盘的整盘展开不栈溢出且耗时可接受', () => {
    const cfg = DIFFICULTIES[2];
    if (cfg === undefined) throw new Error('expert config missing');
    const board = layMines(cfg.rows, cfg.cols, cfg.mineCount, { r: 0, c: 0 }, 1);

    // 找一个人为清空的地雷，制造接近全盘的展开压力
    const cleared: Cell[][] = board.map((row) =>
      row.map((cell) => (cell.isMine ? { ...cell, isMine: false } : cell)),
    );
    const full: Board = cleared.map((row, r) =>
      row.map((cell, c) => ({ ...cell, adjacent: countAdjacentMines(cleared, r, c) })),
    );

    const startedAt = performance.now();
    const result = floodFill(full, { r: 0, c: 0 });
    const elapsed = performance.now() - startedAt;

    expect(result.revealed).toBe(cfg.rows * cfg.cols);
    expect(elapsed).toBeLessThan(100);
  });

  it('展开是收敛的：不重复计入已翻开的格子', () => {
    const board = parseBoard(['....', '....', '....', '....']);
    const result = floodFill(board, { r: 0, c: 0 });
    expect(result.revealed).toBe(16);
    expect(countRevealed(result.board)).toBe(16);
  });
});
