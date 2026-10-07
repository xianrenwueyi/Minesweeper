/**
 * 状态机与命令式核心 API（plan §4.4 / §4.5）
 *
 * 全部命令为纯函数：返回【新的】GameState，绝不修改传入的 state（章程 C2）。
 * 本文件不得引用任何 DOM API（章程 C1 / NFR-03）。
 */
import type { Board, Cell, Coord, DifficultyConfig, GameState, Mark } from './types.js';
import { countAdjacentMines, createEmptyGrid, forEachNeighbor, getCell, inBounds, layMines } from './board.js';
import { floodFill } from './flood.js';

/** 标记循环顺序（FR-08）：none → flag → question → none */
const MARK_CYCLE: readonly Mark[] = ['none', 'flag', 'question'];

/** 时间钳制上限（FR-11 / EC-11） */
export const MAX_ELAPSED_SECONDS = 999;

/** 创建一局未开始的游戏。棋盘不含任何地雷（延后布雷，ADR-01） */
export function createGame(config: DifficultyConfig, seed: number): GameState {
  return {
    config,
    board: createEmptyGrid(config.rows, config.cols),
    status: 'ready',
    seed,
    firstReveal: null,
    explodedAt: null,
    startedAt: null,
    endedAt: null,
  };
}

/**
 * 实例化一局新游戏（必须显式传入种子）。
 * 种子由表现层产生（如 Date.now()），使本模块保持纯净可测（章程 C3 / NFR-04）。
 */
export function newGame(config: DifficultyConfig, seed: number): GameState {
  return createGame(config, seed);
}

/** 局面是否已结束 */
export function isTerminal(state: GameState): boolean {
  return state.status === 'won' || state.status === 'lost';
}

/** 统计旗帜数（FR-10） */
export function getFlagCount(board: Board): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.mark === 'flag') {
        count += 1;
      }
    }
  }
  return count;
}

/** 剩余雷数 = 总雷数 − 旗帜数，可为负（FR-10 / EC-07） */
export function getRemainingMines(state: GameState): number {
  return state.config.mineCount - getFlagCount(state.board);
}

/** 已翻开的格子数 */
export function getRevealedCount(board: Board): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isRevealed) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * 已用时间（整秒，FR-11）。
 * 真源是时间戳而非累加计数器，因此不受 setInterval 漂移影响（ADR-08）。
 */
export function getElapsedSeconds(state: GameState, now: number): number {
  if (state.startedAt === null) {
    return 0;
  }
  const end = state.endedAt ?? now;
  const seconds = Math.floor((end - state.startedAt) / 1000);
  return Math.min(MAX_ELAPSED_SECONDS, Math.max(0, seconds));
}

/** 是否满足胜利条件（FR-13）：已翻开格数 === 非雷格总数 */
function isWon(state: GameState, board: Board): boolean {
  const total = state.config.rows * state.config.cols;
  return getRevealedCount(board) === total - state.config.mineCount;
}

/** 失败结算（FR-12）：揭示所有地雷并冻结 */
function lose(state: GameState, board: Board, at: Coord, now: number): GameState {
  const revealed: Cell[][] = [];
  for (const row of board) {
    revealed.push(row.map((cell) => (cell.isMine ? { ...cell, isRevealed: true } : cell)));
  }
  return {
    ...state,
    board: revealed,
    status: 'lost',
    explodedAt: at,
    endedAt: now,
  };
}

/**
 * 左键翻开（FR-04 / FR-05 / FR-07 / FR-12 / FR-13）。
 *
 * 决策顺序严格如下（plan §4.4，保证 EC-10 与「不存在 ready → lost」）：
 *   1. 终态            → 空操作
 *   2. 已翻开          → 空操作
 *   3. 是地雷          → 失败
 *   4. ready           → 布雷并转入 playing，记录 startedAt
 *   5. 展开
 *   6. 判胜利
 */
export function revealCell(state: GameState, r: number, c: number, now: number): GameState {
  if (isTerminal(state) || !inBounds(state.board, r, c)) {
    return state;
  }

  const target = getCell(state.board, r, c);
  if (target === undefined || target.isRevealed) {
    return state;
  }

  if (target.isMine) {
    return lose(state, state.board, { r, c }, now);
  }

  let board: Board = state.board;
  let next: GameState = state;

  if (state.status === 'ready') {
    board = layMines(state.config.rows, state.config.cols, state.config.mineCount, { r, c }, state.seed);
    next = { ...state, board, status: 'playing', firstReveal: { r, c }, startedAt: now };
  }

  const filled = floodFill(board, { r, c });
  next = { ...next, board: filled.board };

  if (isWon(next, filled.board)) {
    return { ...next, status: 'won', endedAt: now, board: flagAllMines(filled.board) };
  }

  return next;
}

/** 胜利时为所有地雷补旗（OQ-02 / ADR-12），使剩余雷数归零 */
function flagAllMines(board: Board): Board {
  return board.map((row) =>
    row.map((cell) => (cell.isMine ? { ...cell, mark: 'flag' as Mark } : cell)),
  );
}

/**
 * 右键标记循环（FR-08 / FR-09）。
 * 已翻开格与终态下为空操作（EC-02 / EC-03）。
 */
export function cycleMark(state: GameState, r: number, c: number): GameState {
  if (isTerminal(state)) {
    return state;
  }

  const target = getCell(state.board, r, c);
  if (target === undefined || target.isRevealed) {
    return state;
  }

  const currentIndex = MARK_CYCLE.indexOf(target.mark);
  const nextMark = MARK_CYCLE[(currentIndex + 1) % MARK_CYCLE.length] ?? 'none';

  const board: Cell[][] = [];
  for (let rowIndex = 0; rowIndex < state.board.length; rowIndex += 1) {
    const row = state.board[rowIndex];
    if (row === undefined) {
      continue;
    }
    board.push(
      row.map((cell, colIndex) =>
        rowIndex === r && colIndex === c ? { ...cell, mark: nextMark } : cell,
      ),
    );
  }

  return { ...state, board };
}

/**
 * 和弦操作（FR-19 / ADR-17）。
 *
 * 对已翻开的数字格触发：当邻域旗数等于该格数字时，翻开所有「未翻开、非旗」邻格。
 * 触发方式（表现层负责）：双击或中键；移动端不支持。
 *
 * 决策顺序：
 *   1. 非 playing / 越界            → 空操作
 *   2. 目标非「已翻开数字格」       → 空操作（EC-18）
 *   3. 邻域旗数 ≠ 数字              → 空操作（EC-16）
 *   4. 存在未标旗的真雷            → 失败（EC-17）
 *   5. 翻开全部目标格（0 格触发展开）
 *   6. 判胜利
 */
export function chordReveal(state: GameState, r: number, c: number, now: number): GameState {
  if (state.status !== 'playing' || !inBounds(state.board, r, c)) {
    return state;
  }

  const cell = getCell(state.board, r, c);
  if (cell === undefined || !cell.isRevealed || cell.isMine || cell.adjacent === 0) {
    return state;
  }

  let flags = 0;
  const targets: Coord[] = [];
  forEachNeighbor(state.board, r, c, (neighbor, nr, nc) => {
    if (neighbor.mark === 'flag') {
      flags += 1;
    } else if (!neighbor.isRevealed) {
      targets.push({ r: nr, c: nc });
    }
  });

  if (flags !== cell.adjacent) {
    return state;
  }

  // 旗数匹配，但玩家可能标错旗：未标旗的真雷一旦被和弦翻开即失败（ADR-17）
  for (const target of targets) {
    const targetCell = getCell(state.board, target.r, target.c);
    if (targetCell !== undefined && targetCell.isMine) {
      return lose(state, state.board, target, now);
    }
  }

  let board: Board = state.board;
  for (const target of targets) {
    board = floodFill(board, target).board;
  }

  const next: GameState = { ...state, board };
  if (isWon(next, board)) {
    return { ...next, status: 'won', endedAt: now, board: flagAllMines(board) };
  }
  return next;
}

/**
 * 兜底防御：重算所有【非雷格】的相邻雷数。
 * 与 layMines 保持一致 —— 地雷格的 adjacent 恒为 0（plan §4.2 不变量 I4/I5 只约束非雷格）。
 */
export function recomputeAdjacency(board: Board): Board {
  return board.map((row, r) =>
    row.map((cell, c) =>
      cell.isMine ? cell : { ...cell, adjacent: countAdjacentMines(board, r, c) },
    ),
  );
}
