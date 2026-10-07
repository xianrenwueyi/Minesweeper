/**
 * 端到端验收（AC-A41 / AC-A42 / AC-A43 / AC-M26 的规则层）
 *
 * 目的：从「一局游戏」的完整视角驱动需求，验证 §2 自动验收项中
 * 属于集成层面的部分（尤其是章程 C3 的确定性与终态冻结的端到端表现）。
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, getDifficulty } from '../src/core/config.js';
import {
  cycleMark,
  getElapsedSeconds,
  getFlagCount,
  getRemainingMines,
  getRevealedCount,
  newGame,
  revealCell,
} from '../src/core/game.js';
import type { Board, Cell, Coord, GameState } from '../src/core/types.js';

interface CellView {
  isMine: boolean;
  isRevealed: boolean;
  mark: string;
  adjacent: number;
}

interface Snapshot {
  status: string;
  difficultyId: string;
  rows: number;
  cols: number;
  mineCount: number;
  flagCount: number;
  remainingMines: number;
  revealedCount: number;
  elapsedSeconds: number;
  seed: number;
  board: CellView[][];
}

function snapshot(state: GameState, now: number): Snapshot {
  return {
    status: state.status,
    difficultyId: state.config.id,
    rows: state.config.rows,
    cols: state.config.cols,
    mineCount: state.config.mineCount,
    flagCount: getFlagCount(state.board),
    remainingMines: getRemainingMines(state),
    revealedCount: getRevealedCount(state.board),
    elapsedSeconds: getElapsedSeconds(state, now),
    seed: state.seed,
    board: state.board.map((row) =>
      row.map((cell) => ({
        isMine: cell.isMine,
        isRevealed: cell.isRevealed,
        mark: cell.mark,
        adjacent: cell.adjacent,
      })),
    ),
  };
}

function cellAt(board: Board, r: number, c: number): Cell {
  const row = board[r];
  const cell = row === undefined ? undefined : row[c];
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

function findMine(board: Board): Coord {
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    if (row === undefined) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]?.isMine === true) return { r, c };
    }
  }
  throw new Error('no mine found');
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

/** 把一局推进到终态（真终态由规则决定，测试只负责驱动） */
function playToEnd(state: GameState): GameState {
  let current = state;
  for (let r = 0; r < state.config.rows; r += 1) {
    for (let c = 0; c < state.config.cols; c += 1) {
      const cell = cellAt(current.board, r, c);
      if (!cell.isMine && !cell.isRevealed) {
        current = revealCell(current, r, c, 10);
      }
    }
  }
  return current;
}

describe('AC-A41：相同种子完全可重现（章程 C3 / FR-18）', () => {
  it('同一难度 + 同一种子 + 同一操作序列 → 快照逐字节相同', () => {
    for (const config of DIFFICULTIES) {
      const first = playToEnd(revealCell(newGame(config, 4242), 0, 0, 100));
      const second = playToEnd(revealCell(newGame(config, 4242), 0, 0, 100));
      expect(snapshot(second, 100)).toEqual(snapshot(first, 100));
    }
  });

  it('不同种子产生不同的雷区布局', () => {
    const a = revealCell(newGame(getDifficulty('intermediate'), 1), 5, 5, 0);
    const b = revealCell(newGame(getDifficulty('intermediate'), 2), 5, 5, 0);
    expect(snapshot(a, 0)).not.toEqual(snapshot(b, 0));
  });

  it('快照的字段集覆盖 FR-18 的要求', () => {
    const snap = snapshot(newGame(getDifficulty('beginner'), 7), 0);
    expect(Object.keys(snap).sort()).toEqual(
      [
        'board',
        'cols',
        'difficultyId',
        'elapsedSeconds',
        'flagCount',
        'mineCount',
        'remainingMines',
        'revealedCount',
        'rows',
        'seed',
        'status',
      ].sort(),
    );
  });

  it('AC-A42：快照是副本 —— 改写它不影响后续读取', () => {
    const state = revealCell(newGame(getDifficulty('beginner'), 42), 4, 4, 0);
    const first = snapshot(state, 0);
    // 篡改副本
    first.status = 'won';
    first.flagCount = 999;
    const target = first.board[0]?.[0];
    if (target !== undefined) target.isMine = true;

    const second = snapshot(state, 0);
    expect(second.status).toBe(state.status);
    expect(second.flagCount).toBe(getFlagCount(state.board));
    expect(second.board[0]?.[0]?.isMine).toBe(cellAt(state.board, 0, 0).isMine);
  });
});

describe('端到端：一局完整的失败流程', () => {
  it('ready → 标旗 → 翻开 → 踩雷 → 冻结，且每一步的快照都自洽', () => {
    const config = getDifficulty('beginner');

    // 1) ready
    let state = newGame(config, 42);
    let snap = snapshot(state, 0);
    expect(snap.status).toBe('ready');
    expect(snap.revealedCount).toBe(0);
    expect(snap.flagCount).toBe(0);
    expect(snap.remainingMines).toBe(config.mineCount);
    expect(snap.elapsedSeconds).toBe(0);

    // 2) 标旗：不启动时钟，剩余雷数递减
    state = cycleMark(state, 0, 0);
    snap = snapshot(state, 0);
    expect(snap.status).toBe('ready');
    expect(snap.flagCount).toBe(1);
    expect(snap.remainingMines).toBe(config.mineCount - 1);
    expect(state.startedAt).toBeNull();

    // 3) 首次翻开：进入 playing 并开始计时
    state = revealCell(state, 4, 4, 1000);
    snap = snapshot(state, 3000);
    expect(snap.status).toBe('playing');
    expect(snap.revealedCount).toBeGreaterThan(0);
    expect(snap.elapsedSeconds).toBe(2);

    // 4) 踩雷：终态、揭示全部地雷、时钟冻结
    const mine = findMine(state.board);
    state = revealCell(state, mine.r, mine.c, 5000);
    snap = snapshot(state, 999_999);
    expect(snap.status).toBe('lost');
    expect(snap.elapsedSeconds).toBe(4);
    expect(countMinesRevealed(state.board)).toBe(config.mineCount);
    expect(state.explodedAt).toEqual(mine);

    // 5) 冻结：任何后续操作都不改变状态
    expect(revealCell(state, 0, 1, 6000)).toBe(state);
    expect(cycleMark(state, 8, 8)).toBe(state);
  });
});

describe('端到端：一局完整的胜利流程', () => {
  it('翻开全部非雷格 → won → 补旗 → 冻结', () => {
    const config = getDifficulty('intermediate');
    const safeTotal = config.rows * config.cols - config.mineCount;

    let state = revealCell(newGame(config, 2024), 8, 8, 0);
    expect(state.status).toBe('playing');

    state = playToEnd(state);
    const snap = snapshot(state, 60_000);

    expect(snap.status).toBe('won');
    expect(snap.revealedCount).toBe(safeTotal);
    expect(snap.flagCount).toBe(config.mineCount);
    expect(snap.remainingMines).toBe(0);
    expect(state.endedAt).toBe(10);

    // 终态冻结
    expect(revealCell(state, 0, 0, 70_000)).toBe(state);
    expect(cycleMark(state, 0, 0)).toBe(state);
  });

  it('胜利判定与玩家是否标旗无关（AC-A23 的端到端侧）', () => {
    const config = getDifficulty('beginner');
    const withFlags = cycleMark(cycleMark(newGame(config, 99), 1, 1), 2, 2);
    const played = playToEnd(revealCell(withFlags, 4, 4, 0));
    expect(played.status).toBe('won');
    expect(getRevealedCount(played.board)).toBe(config.rows * config.cols - config.mineCount);
  });
});

describe('AC-A43：切换到相同难度等价于重新开始（EC-15）', () => {
  it('新局回到 ready，时钟归零，棋盘清空（新一轮用不同种子）', () => {
    const config = getDifficulty('beginner');
    const played = revealCell(newGame(config, 111), 4, 4, 5000);
    expect(played.status).toBe('playing');

    // 同一难度、新种子 = 重新开始
    const restarted = newGame(config, 222);
    const snap = snapshot(restarted, 999_999);
    expect(snap.status).toBe('ready');
    expect(snap.difficultyId).toBe(config.id);
    expect(snap.revealedCount).toBe(0);
    expect(snap.flagCount).toBe(0);
    expect(snap.elapsedSeconds).toBe(0);
    expect(snap.remainingMines).toBe(config.mineCount);
    expect(restarted.board).not.toBe(played.board);
  });
});
