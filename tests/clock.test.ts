/**
 * AC-A35 ~ AC-A38：计时逻辑（FR-11 / EC-11 / ADR-08）
 *
 * 全部用例注入伪造的 now，绝不依赖真实时间 —— 保证测试永不 flaky（plan §8）。
 */
import { describe, expect, it } from 'vitest';
import { MAX_ELAPSED_SECONDS, createGame, getElapsedSeconds, revealCell } from '../src/core/game.js';
import { getDifficulty } from '../src/core/config.js';
import type { Board, Cell, GameState } from '../src/core/types.js';
import { getCell } from '../src/core/board.js';

const BEGINNER = getDifficulty('beginner');

function mustCell(board: Board, r: number, c: number): Cell {
  const cell = getCell(board, r, c);
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

function findMine(board: Board): { r: number; c: number } {
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    if (row === undefined) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]?.isMine === true) return { r, c };
    }
  }
  throw new Error('no mine found');
}

/** 推进到 playing 局面 */
function playingState(now = 0): GameState {
  return revealCell(createGame(BEGINNER, 42), 4, 4, now);
}

/** 推进到 won 局面 */
function wonState(): GameState {
  let state = playingState();
  for (let r = 0; r < BEGINNER.rows; r += 1) {
    for (let c = 0; c < BEGINNER.cols; c += 1) {
      const cell = mustCell(state.board, r, c);
      if (!cell.isMine && !cell.isRevealed) {
        state = revealCell(state, r, c, 500);
      }
    }
  }
  return state;
}

describe('ready 阶段（AC-A35）', () => {
  it('未首击时已用时间为 0，无论 now 多大（AC-A35）', () => {
    const state = createGame(BEGINNER, 42);
    expect(getElapsedSeconds(state, 0)).toBe(0);
    expect(getElapsedSeconds(state, 999999)).toBe(0);
  });

  it('标旗不启动计时（EC-13 的计时侧）', () => {
    const state = createGame(BEGINNER, 42);
    expect(getElapsedSeconds(state, 1e9)).toBe(0);
  });
});

describe('playing 阶段：时间戳推导（AC-A36 / ADR-08）', () => {
  it('按 floor((now - startedAt) / 1000) 推导整秒（AC-A36）', () => {
    const state = playingState(0);
    expect(state.startedAt).toBe(0);
    expect(getElapsedSeconds(state, 0)).toBe(0);
    expect(getElapsedSeconds(state, 999)).toBe(0);
    expect(getElapsedSeconds(state, 1000)).toBe(1);
    expect(getElapsedSeconds(state, 1999)).toBe(1);
    expect(getElapsedSeconds(state, 2000)).toBe(2);
    expect(getElapsedSeconds(state, 65000)).toBe(65);
  });

  it('非零起点同样正确（startedAt 是绝对时间戳）', () => {
    const state = playingState(1_700_000_000_000);
    expect(getElapsedSeconds(state, 1_700_000_000_000)).toBe(0);
    expect(getElapsedSeconds(state, 1_700_000_003_999)).toBe(3);
    expect(getElapsedSeconds(state, 1_700_000_004_000)).toBe(4);
  });

  it('now 早于 startedAt 时钳制为 0，绝不出现负数', () => {
    const state = playingState(5000);
    expect(getElapsedSeconds(state, 0)).toBe(0);
    expect(getElapsedSeconds(state, 4999)).toBe(0);
  });

  it('时间由时间戳推导而非累加，因此与查询次数无关（ADR-08）', () => {
    const state = playingState(1000);
    for (let i = 0; i < 100; i += 1) {
      expect(getElapsedSeconds(state, 1000 + i * 7)).toBe(Math.floor((i * 7) / 1000));
    }
    // 反复查询不改变结果
    expect(getElapsedSeconds(state, 60000)).toBe(59);
    expect(getElapsedSeconds(state, 60000)).toBe(59);
  });

  it('不调用真实时钟：即使 now 是固定值，结果也完全可重现', () => {
    const a = getElapsedSeconds(playingState(123), 4567);
    const b = getElapsedSeconds(playingState(123), 4567);
    expect(a).toBe(b);
  });

  it('end 早于 startedAt 的畸形状态钳制为 0（防御性回归）', () => {
    // 任何导致 end < startedAt 的状态都不得产出负数
    const state: GameState = { ...playingState(10_000), endedAt: 5_000 };
    expect(getElapsedSeconds(state, 0)).toBe(0);
  });
});

describe('终态：冻结（AC-A37）', () => {
  it('胜利后返回冻结值，传入更大的 now 不改变结果（AC-A37）', () => {
    const won = wonState();
    expect(won.status).toBe('won');
    const atEnd = getElapsedSeconds(won, won.endedAt ?? 0);
    expect(getElapsedSeconds(won, 500)).toBe(atEnd);
    expect(getElapsedSeconds(won, 999999)).toBe(atEnd);
  });

  it('失败后同样冻结（AC-A37）', () => {
    const played = playingState(0);
    const mine = findMine(played.board);
    const lost = revealCell(played, mine.r, mine.c, 3000);
    expect(lost.status).toBe('lost');
    expect(lost.endedAt).toBe(3000);
    expect(getElapsedSeconds(lost, 3000)).toBe(3);
    expect(getElapsedSeconds(lost, 100000)).toBe(3);
  });

  it('终态时刻取自 endedAt 而非查询时刻', () => {
    const played = playingState(0);
    const mine = findMine(played.board);
    const lost = revealCell(played, mine.r, mine.c, 4200);
    expect(getElapsedSeconds(lost, 999999)).toBe(4);
  });
});

describe('上限钳制（AC-A38 / EC-11）', () => {
  it('超过 999 秒时钳制为 999（AC-A38）', () => {
    const state = playingState(0);
    expect(getElapsedSeconds(state, 999_000)).toBe(MAX_ELAPSED_SECONDS);
    expect(getElapsedSeconds(state, 1_000_000)).toBe(MAX_ELAPSED_SECONDS);
    expect(getElapsedSeconds(state, 86_400_000)).toBe(MAX_ELAPSED_SECONDS);
  });

  it('恰好 999 秒时显示 999，1000 秒仍是 999', () => {
    const state = playingState(0);
    expect(getElapsedSeconds(state, 999_999)).toBe(999);
    expect(getElapsedSeconds(state, 1_000_000)).toBe(999);
  });

  it('998 秒不触发钳制', () => {
    const state = playingState(0);
    expect(getElapsedSeconds(state, 998_999)).toBe(998);
  });
});
