/**
 * AC-A44 ~ AC-A48：和弦操作（FR-19 / ADR-17 / EC-16 / EC-17 / EC-18）
 */
import { describe, expect, it } from 'vitest';
import { countAdjacentMines, getCell } from '../src/core/board.js';
import { chordReveal, createGame, revealCell } from '../src/core/game.js';
import { getDifficulty } from '../src/core/config.js';
import type { Board, Cell, GameState } from '../src/core/types.js';

const BEGINNER = getDifficulty('beginner');

function mustCell(board: Board, r: number, c: number): Cell {
  const cell = getCell(board, r, c);
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

/** 从字符串图构造棋盘：'.' 非雷，'*' 地雷。adjacent 由真实雷分布计算。 */
function parseGrid(rows: readonly string[]): Board {
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

/** 把棋盘包成一个 playing 态（首击已发生、计时已开始） */
function playingState(board: Board, mineCount: number): GameState {
  return {
    config: { id: 'beginner', name: 'test', rows: board.length, cols: board[0]?.length ?? 0, mineCount },
    board,
    status: 'playing',
    seed: 1,
    firstReveal: { r: 0, c: 0 },
    explodedAt: null,
    startedAt: 0,
    endedAt: null,
  };
}

/** 翻开一个数字格（其 adjacent > 0，展开只在自身止步） */
function revealNumber(state: GameState, r: number, c: number, now: number): GameState {
  const cell = mustCell(state.board, r, c);
  expect(cell.isMine).toBe(false);
  expect(cell.adjacent).toBeGreaterThan(0);
  return revealCell(state, r, c, now);
}

/** 标旗 */
function flag(state: GameState, r: number, c: number): GameState {
  const board = state.board.map((row, rr) =>
    row.map((cc, ccIndex) => (rr === r && ccIndex === c ? { ...cc, mark: 'flag' as const } : cc)),
  );
  return { ...state, board };
}

describe('chordReveal：旗数不匹配 → 空操作（AC-A44 / EC-16）', () => {
  it('邻域旗数 < 相邻雷数时返回原 state 引用', () => {
    // 中心 (0,1) adjacent=2（雷在 (0,0) 与 (1,1)），不标任何旗
    const grid = parseGrid(['*..', '.*.', '..*']);
    let state = playingState(grid, 3);
    state = revealNumber(state, 0, 1, 0);
    expect(mustCell(state.board, 0, 1).adjacent).toBe(2);
    expect(chordReveal(state, 0, 1, 10)).toBe(state);
  });

  it('邻域旗数 > 相邻雷数时返回原 state 引用', () => {
    const grid = parseGrid(['*..', '.*.', '..*']);
    let state = playingState(grid, 3);
    state = revealNumber(state, 0, 1, 0);
    // 标 3 面旗（超过 adjacent=2）
    state = flag(flag(flag(state, 0, 2), 1, 0), 1, 2);
    expect(chordReveal(state, 0, 1, 10)).toBe(state);
  });
});

describe('chordReveal：旗数匹配 → 翻开周边（AC-A45）', () => {
  it('翻开所有未翻开、非旗邻格，且地雷旗不被翻开', () => {
    // (0,1) adjacent=2（雷 (0,0)/(1,1)），标两面旗后和弦
    const grid = parseGrid(['*..', '.*.', '..*']);
    let state = playingState(grid, 3);
    state = revealNumber(state, 0, 1, 0);
    state = flag(flag(state, 0, 0), 1, 1);

    const after = chordReveal(state, 0, 1, 10);

    // 三个安全邻格被翻开
    expect(mustCell(after.board, 0, 2).isRevealed).toBe(true);
    expect(mustCell(after.board, 1, 0).isRevealed).toBe(true);
    expect(mustCell(after.board, 1, 2).isRevealed).toBe(true);
    // 两面地雷旗保持标记且未被翻开
    expect(mustCell(after.board, 0, 0)).toMatchObject({ isMine: true, mark: 'flag', isRevealed: false });
    expect(mustCell(after.board, 1, 1)).toMatchObject({ isMine: true, mark: 'flag', isRevealed: false });
    // 未标旗的地雷 (2,2) 仍隐藏
    expect(mustCell(after.board, 2, 2)).toMatchObject({ isMine: true, isRevealed: false });
    expect(after.status).toBe('playing');
  });
});

describe('chordReveal：标错旗 → 翻开真雷失败（AC-A46 / EC-17）', () => {
  it('旗数匹配但存在未标旗的真雷时判负，explodedAt 指向该雷', () => {
    // (0,1) adjacent=2（真雷 (0,0)/(1,1)）。标错旗：标 (0,0) 与安全格 (0,2)，漏掉 (1,1)
    const grid = parseGrid(['*..', '.*.', '..*']);
    let state = playingState(grid, 3);
    state = revealNumber(state, 0, 1, 0);
    state = flag(flag(state, 0, 0), 0, 2);

    const after = chordReveal(state, 0, 1, 10);

    expect(after.status).toBe('lost');
    expect(after.explodedAt).toEqual({ r: 1, c: 1 });
    // 全部地雷被揭示
    for (const [r, c] of [
      [0, 0],
      [1, 1],
      [2, 2],
    ] as const) {
      expect(mustCell(after.board, r, c).isRevealed).toBe(true);
    }
  });
});

describe('chordReveal：翻开最后一格 → 胜利（AC-A47）', () => {
  it('和弦翻开所有剩余安全格后判胜并自动补旗', () => {
    // 3×3、1 雷在角；翻中心、标雷、和弦 → 8 个安全格全部翻开 → 胜利
    const grid = parseGrid(['*..', '...', '...']);
    let state = playingState(grid, 1);
    state = revealNumber(state, 1, 1, 0); // 中心 adjacent=1
    state = flag(state, 0, 0);
    const after = chordReveal(state, 1, 1, 10);

    expect(after.status).toBe('won');
    expect(mustCell(after.board, 0, 0).mark).toBe('flag');
    let revealedSafe = 0;
    for (const row of after.board) {
      for (const cell of row) {
        if (!cell.isMine && cell.isRevealed) revealedSafe += 1;
      }
    }
    expect(revealedSafe).toBe(8);
  });
});

describe('chordReveal：非法目标 → 空操作（AC-A48 / EC-18）', () => {
  it('对未翻开格和弦是空操作', () => {
    const state = playingState(parseGrid(['*..', '...', '...']), 1);
    expect(chordReveal(state, 2, 2, 0)).toBe(state);
  });

  it('对已翻开的空白格（adjacent=0）和弦是空操作', () => {
    const grid = parseGrid(['*..', '...', '...']);
    // 手工把 (2,2) 置为已翻开空白（adjacent=0）
    const board = grid.map((row, r) =>
      row.map((cell, c) => (r === 2 && c === 2 ? { ...cell, isRevealed: true } : cell)),
    );
    const state = playingState(board, 1);
    expect(mustCell(state.board, 2, 2).isRevealed).toBe(true);
    expect(chordReveal(state, 2, 2, 0)).toBe(state);
  });

  it('对终局棋盘和弦是空操作', () => {
    const grid = parseGrid(['*..', '...', '...']);
    const playing = revealNumber(playingState(grid, 1), 1, 1, 0);
    // 翻开地雷制造终局
    const lost = revealCell(playing, 0, 0, 5);
    expect(lost.status).toBe('lost');
    expect(chordReveal(lost, 1, 1, 10)).toBe(lost);
  });

  it('对越界坐标和弦是空操作', () => {
    const state = playingState(parseGrid(['*..', '...', '...']), 1);
    expect(chordReveal(state, -1, 0, 0)).toBe(state);
    expect(chordReveal(state, 0, 99, 0)).toBe(state);
  });
});

describe('chordReveal：不修改入参（章程 C2）', () => {
  it('和弦不改变传入的 state', () => {
    const grid = parseGrid(['*..', '.*.', '..*']);
    let state = playingState(grid, 3);
    state = revealNumber(state, 0, 1, 0);
    state = flag(flag(state, 0, 0), 1, 1);
    const snapshot = JSON.stringify(state);
    chordReveal(state, 0, 1, 10);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('空操作时返回同一引用（幂等）', () => {
    const state = playingState(parseGrid(['*..', '...', '...']), 1);
    const once = chordReveal(state, 0, 0, 0);
    expect(once).toBe(state);
  });
});

describe('和弦与 createGame 集成冒烟', () => {
  it('内置难度下先翻开再标旗再和弦不抛异常', () => {
    const state = createGame(BEGINNER, 42);
    const revealed = revealCell(state, 4, 4, 0);
    expect(() => chordReveal(revealed, 4, 4, 10)).not.toThrow();
  });
});
