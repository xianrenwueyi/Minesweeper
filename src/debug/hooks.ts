/**
 * window.__minesweeper 验收契约（FR-18 / 章程 C7 / plan §6）
 *
 * 存在意义：让验收测试能区分「规则错误」与「渲染错误」，而不是靠像素或文本猜测。
 * 约束：所有返回值都是副本，外部改不动内部状态。
 */
import { DIFFICULTIES, findDifficulty, getDifficulty, makeCustomDifficulty } from '../core/config.js';
import { parseGame } from '../core/persist.js';
import { getElapsedSeconds, getFlagCount, getRemainingMines, getRevealedCount } from '../core/game.js';
import type { Board, Cell, DifficultyConfig, GameState, Mark } from '../core/types.js';
import type { Controller } from '../ui/controller.js';

export interface CellSnapshot {
  readonly isMine: boolean;
  readonly isRevealed: boolean;
  readonly mark: Mark;
  readonly adjacent: number;
}

export interface Snapshot {
  readonly status: GameState['status'];
  readonly difficultyId: string;
  readonly rows: number;
  readonly cols: number;
  readonly mineCount: number;
  readonly flagCount: number;
  readonly remainingMines: number;
  readonly revealedCount: number;
  readonly elapsedSeconds: number;
  readonly seed: number;
  readonly firstReveal: { readonly r: number; readonly c: number } | null;
  readonly explodedAt: { readonly r: number; readonly c: number } | null;
  readonly board: readonly (readonly CellSnapshot[])[];
}

export interface MinesweeperHooks {
  readonly version: string;
  getSnapshot(): Snapshot;
  getCell(r: number, c: number): CellSnapshot | undefined;
  getSeed(): number;
  listDifficulties(): readonly DifficultyConfig[];
  newGame(difficultyId: string, seed?: number): void;
  newCustomGame(rows: number, cols: number, mines: number, seed?: number): void;
  reveal(r: number, c: number): void;
  cycleMark(r: number, c: number): void;
  chord(r: number, c: number): void;
  restore(json: string): void;
}

function copyCell(cell: Cell): CellSnapshot {
  return {
    isMine: cell.isMine,
    isRevealed: cell.isRevealed,
    mark: cell.mark,
    adjacent: cell.adjacent,
  };
}

function copyBoard(board: Board): CellSnapshot[][] {
  return board.map((row) => row.map(copyCell));
}

function copyCoord(coord: { r: number; c: number } | null): { r: number; c: number } | null {
  return coord === null ? null : { r: coord.r, c: coord.c };
}

function findCell(board: Board, r: number, c: number): Cell | undefined {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) {
    return undefined;
  }
  const row = board[r];
  return row === undefined ? undefined : row[c];
}

function buildSnapshot(state: GameState, now: number): Snapshot {
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
    firstReveal: copyCoord(state.firstReveal),
    explodedAt: copyCoord(state.explodedAt),
    board: copyBoard(state.board),
  };
}

/** 创建契约实现（不立即挂载，便于测试） */
export function createHooks(controller: Controller): MinesweeperHooks {
  return {
    version: '1.1.0',

    getSnapshot(): Snapshot {
      return buildSnapshot(controller.getState(), controller.getNow());
    },

    getCell(r: number, c: number): CellSnapshot | undefined {
      const cell = findCell(controller.getState().board, r, c);
      return cell === undefined ? undefined : copyCell(cell);
    },

    getSeed(): number {
      return controller.getState().seed;
    },

    listDifficulties(): readonly DifficultyConfig[] {
      return DIFFICULTIES.map((config) => ({ ...config }));
    },

    newGame(difficultyId: string, seed?: number): void {
      if (findDifficulty(difficultyId) === undefined) {
        throw new Error(`未知难度：${difficultyId}`);
      }
      controller.startNewGame(getDifficulty(difficultyId as 'beginner' | 'intermediate' | 'expert'), seed);
    },

    newCustomGame(rows: number, cols: number, mines: number, seed?: number): void {
      controller.startNewGame(makeCustomDifficulty(rows, cols, mines), seed);
    },

    reveal(r: number, c: number): void {
      controller.reveal(r, c);
    },

    cycleMark(r: number, c: number): void {
      controller.cycleMark(r, c);
    },

    chord(r: number, c: number): void {
      controller.chord(r, c);
    },

    restore(json: string): void {
      const state = parseGame(json);
      if (state === null) {
        throw new Error('非法存档：无法恢复');
      }
      controller.restore(state);
    },
  };
}

/** 挂载到 window（FR-18） */
export function installHooks(controller: Controller): void {
  // 需要挂到 window 上，因此必须写 window —— 这是 debug/** 层，不受 core 约束（NFR-03 只约束 src/core/**）
  (window as unknown as { __minesweeper?: MinesweeperHooks }).__minesweeper = createHooks(controller);
}
