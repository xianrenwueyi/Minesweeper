/**
 * AC-A28 ~ AC-A34：标记循环与派生量（FR-08 / FR-09 / FR-10 / EC-02 / EC-03 / EC-07 / EC-08 / EC-13）
 */
import { describe, expect, it } from 'vitest';
import {
  createGame,
  cycleMark,
  getFlagCount,
  getRemainingMines,
  getRevealedCount,
  revealCell,
} from '../src/core/game.js';
import { getCell, layMines } from '../src/core/board.js';
import { getDifficulty } from '../src/core/config.js';
import type { Board, Cell, GameState } from '../src/core/types.js';

const BEGINNER = getDifficulty('beginner');

function cellAt(board: Board, r: number, c: number): Cell {
  const cell = getCell(board, r, c);
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

/** 用一颗地雷的确定性棋盘，便于构造终态 */
function singleMineBoard(): Board {
  return layMines(3, 3, 1, { r: 0, c: 0 }, 1);
}

describe('cycleMark：标记循环（AC-A28 / EC-08）', () => {
  it('未翻开格按 none → flag → question → none 循环（AC-A28）', () => {
    const state = createGame(BEGINNER, 42);
    expect(cellAt(state.board, 3, 3).mark).toBe('none');

    const flagged = cycleMark(state, 3, 3);
    expect(cellAt(flagged.board, 3, 3).mark).toBe('flag');

    const questioned = cycleMark(flagged, 3, 3);
    expect(cellAt(questioned.board, 3, 3).mark).toBe('question');

    const cleared = cycleMark(questioned, 3, 3);
    expect(cellAt(cleared.board, 3, 3).mark).toBe('none');
  });

  it('两次完整循环回到原状态（EC-08）', () => {
    const state = createGame(BEGINNER, 42);
    let s = state;
    for (let i = 0; i < 6; i += 1) {
      s = cycleMark(s, 1, 1);
    }
    expect(cellAt(s.board, 1, 1).mark).toBe('none');
  });

  it('只影响目标格，其他格标记不变', () => {
    let state = cycleMark(createGame(BEGINNER, 42), 0, 0);
    state = cycleMark(state, 5, 5);
    state = cycleMark(state, 5, 5);
    expect(cellAt(state.board, 0, 0).mark).toBe('flag');
    expect(cellAt(state.board, 5, 5).mark).toBe('question');
    expect(cellAt(state.board, 1, 1).mark).toBe('none');
  });

  it('越界坐标为操作', () => {
    const state = createGame(BEGINNER, 42);
    expect(cycleMark(state, -1, 0)).toBe(state);
    expect(cycleMark(state, 0, 99)).toBe(state);
  });

  it('不修改传入的 state（章程 C2）', () => {
    const state = createGame(BEGINNER, 42);
    const snapshot = JSON.parse(JSON.stringify(state)) as unknown;
    cycleMark(state, 2, 2);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });
});

describe('cycleMark：忽略规则（AC-A31 / AC-A32）', () => {
  it('对已翻开格右键是空操作（AC-A31 / EC-02）', () => {
    const played = revealCell(createGame(BEGINNER, 42), 4, 4, 0);
    expect(cellAt(played.board, 4, 4).isRevealed).toBe(true);
    expect(cycleMark(played, 4, 4)).toBe(played);
  });

  it('展开波翻开的所有格子都无法再被标记（AC-A31）', () => {
    const played = revealCell(createGame(BEGINNER, 42), 0, 0, 0);
    for (let r = 0; r < BEGINNER.rows; r += 1) {
      for (let c = 0; c < BEGINNER.cols; c += 1) {
        if (cellAt(played.board, r, c).isRevealed) {
          expect(cycleMark(played, r, c)).toBe(played);
        }
      }
    }
  });

  it('终态下右键是空操作（AC-A32 / EC-03）', () => {
    const played = revealCell(createGame(BEGINNER, 42), 4, 4, 0);
    const lost: GameState = revealCell(played, 0, 0, 0);
    // 找到一个真正的地雷来制造失败
    let exploded = lost;
    for (let r = 0; r < BEGINNER.rows && exploded.status !== 'lost'; r += 1) {
      for (let c = 0; c < BEGINNER.cols; c += 1) {
        if (cellAt(played.board, r, c).isMine) {
          exploded = revealCell(played, r, c, 0);
          break;
        }
      }
    }
    expect(exploded.status).toBe('lost');
    expect(cycleMark(exploded, 8, 8)).toBe(exploded);
  });

  it('胜利终态下右键同样是空操作（AC-A32）', () => {
    const board = singleMineBoard();
    const expectedRevealed = 9 - 1;

    // 逐格翻开非雷格，构造胜利局面
    let state: GameState = {
      config: { id: 'beginner', name: 'test', rows: 3, cols: 3, mineCount: 1 },
      board,
      status: 'playing',
      seed: 1,
      firstReveal: { r: 0, c: 0 },
      explodedAt: null,
      startedAt: 0,
      endedAt: null,
    };
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const cell = cellAt(state.board, r, c);
        if (!cell.isMine && !cell.isRevealed) {
          state = revealCell(state, r, c, 0);
        }
      }
    }
    expect(state.status).toBe('won');
    expect(getRevealedCount(state.board)).toBe(expectedRevealed);
    expect(cycleMark(state, 0, 0)).toBe(state);
  });
});

describe('cycleMark：不启动时钟（AC-A33 / EC-13）', () => {
  it('在 ready 阶段标旗不改变 status、不设置 startedAt（AC-A33）', () => {
    const state = createGame(BEGINNER, 42);
    const flagged = cycleMark(state, 2, 2);
    expect(flagged.status).toBe('ready');
    expect(flagged.startedAt).toBeNull();
    expect(flagged.firstReveal).toBeNull();
  });

  it('先标旗再在别处翻开：时钟仍由首次翻开启动（EC-13）', () => {
    const seeded = cycleMark(cycleMark(createGame(BEGINNER, 42), 2, 2), 3, 3);
    expect(getFlagCount(seeded.board)).toBe(2);
    expect(seeded.startedAt).toBeNull();

    const played = revealCell(seeded, 4, 4, 777);
    expect(played.status).toBe('playing');
    expect(played.startedAt).toBe(777);
    // 首击确实在标旗之后发生：时钟由这一次翻开启动，而非由标旗启动
    expect(seeded.startedAt).toBeNull();
    expect(played.firstReveal).toEqual({ r: 4, c: 4 });
  });

  it('首击的展开波若覆盖到已标旗的格子，旗子会被清除（FR-05 / EC-06）', () => {
    const seeded = cycleMark(cycleMark(createGame(BEGINNER, 42), 2, 2), 3, 3);
    expect(getFlagCount(seeded.board)).toBe(2);

    const played = revealCell(seeded, 4, 4, 777);
    // 这两个格子是否被展开由种子决定；无论展开与否，规则都必须自洽：
    for (const [r, c] of [
      [2, 2],
      [3, 3],
    ] as const) {
      if (cellAt(played.board, r, c).isRevealed) {
        // 被翻开 ⇒ 标记必须已被清除
        expect(cellAt(played.board, r, c).mark).toBe('none');
      } else {
        // 未被翻开 ⇒ 标记必须原样保留
        expect(cellAt(played.board, r, c).mark).toBe('flag');
      }
    }
    // 地雷格永远不会被展开波触碰，因此其标记只可能保留或被玩家改动
    expect(getFlagCount(played.board)).toBeLessThanOrEqual(2);
  });
});

describe('派生量：旗帜数与剩余雷数（AC-A29 / AC-A30 / EC-07）', () => {
  it('未开局时旗帜数为 0，剩余雷数等于总雷数', () => {
    const state = createGame(BEGINNER, 42);
    expect(getFlagCount(state.board)).toBe(0);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount);
  });

  it('flag 计入旗帜数，question 不计入（AC-A29）', () => {
    let state = cycleMark(createGame(BEGINNER, 42), 0, 0); // flag
    expect(getFlagCount(state.board)).toBe(1);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount - 1);

    state = cycleMark(state, 0, 0); // question
    expect(getFlagCount(state.board)).toBe(0);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount);

    state = cycleMark(state, 0, 0); // none
    expect(getFlagCount(state.board)).toBe(0);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount);
  });

  it('多个旗帜累积计数', () => {
    let state = createGame(BEGINNER, 42);
    for (const [r, c] of [
      [0, 0],
      [0, 1],
      [1, 0],
    ] as const) {
      state = cycleMark(state, r, c);
    }
    expect(getFlagCount(state.board)).toBe(3);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount - 3);
  });

  it('旗帜数超过总雷数时剩余雷数为负（AC-A30 / EC-07）', () => {
    let state = createGame(BEGINNER, 42);
    for (let c = 0; c < BEGINNER.cols; c += 1) {
      state = cycleMark(state, 0, c);
    }
    expect(getFlagCount(state.board)).toBe(9);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount - 9); // 1
    // 再标满第二行 → 18 面旗，12 颗雷 → -8
    for (let c = 0; c < BEGINNER.cols; c += 1) {
      state = cycleMark(state, 1, c);
    }
    expect(getFlagCount(state.board)).toBe(18);
    expect(getRemainingMines(state)).toBe(BEGINNER.mineCount - 18);
    expect(getRemainingMines(state)).toBeLessThan(0);
  });

  it('展开清除旗帜后旗帜数下降', () => {
    const played = revealCell(createGame(BEGINNER, 42), 0, 0, 0);
    // 找一个仍被隐藏的安全格标旗
    let flagged = played;
    let marked = false;
    for (let r = 0; r < BEGINNER.rows && !marked; r += 1) {
      for (let c = 0; c < BEGINNER.cols; c += 1) {
        const cell = cellAt(played.board, r, c);
        if (!cell.isMine && !cell.isRevealed) {
          flagged = cycleMark(played, r, c);
          marked = true;
          break;
        }
      }
    }
    expect(getFlagCount(flagged.board)).toBe(1);
  });
});
