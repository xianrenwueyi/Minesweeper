/**
 * 游戏存档序列化 / 反序列化（FR-20 / ADR-21）
 *
 * 本文件是**纯函数**：不引用 localStorage / document / window（章程 C1 / NFR-03）。
 * localStorage 读写由表现层 `src/ui/storage.ts` 负责。
 *
 * 契约：
 *   - `serializeGame(state)` 产出带版本号的 JSON 字符串。
 *   - `parseGame(json)` 对任意输入做 schema 校验，非法时返回 `null` 且绝不抛异常（NFR-13）。
 *   - 终态（won/lost）按 FR-20 不应被保存，因此 `parseGame` 拒绝终态存档。
 */
import type { Board, Cell, Coord, DifficultyConfig, DifficultyId, GameState, Mark } from './types.js';

/** 存档格式版本。变更结构时递增；旧版本一律按不可识别处理。 */
export const SAVE_VERSION = 1;

const DIFFICULTY_IDS: readonly string[] = ['beginner', 'intermediate', 'expert', 'custom'];
const MARKS: readonly string[] = ['none', 'flag', 'question'];
const STATUSES: readonly string[] = ['ready', 'playing'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNullableCoord(value: unknown): value is Coord | null {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return isIntInRange(value['r'], 0, 1_000_000) && isIntInRange(value['c'], 0, 1_000_000);
}

function parseCell(value: unknown): Cell | null {
  if (!isRecord(value)) {
    return null;
  }
  const mark = value['mark'];
  const adjacent = value['adjacent'];
  if (
    typeof value['isMine'] !== 'boolean' ||
    typeof value['isRevealed'] !== 'boolean' ||
    typeof mark !== 'string' ||
    !MARKS.includes(mark) ||
    typeof adjacent !== 'number' ||
    !Number.isInteger(adjacent) ||
    adjacent < 0 ||
    adjacent > 8
  ) {
    return null;
  }
  return {
    isMine: value['isMine'],
    isRevealed: value['isRevealed'],
    mark: mark as Mark,
    adjacent,
  };
}

function parseConfig(value: unknown): DifficultyConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value['id'];
  const name = value['name'];
  const rows = value['rows'];
  const cols = value['cols'];
  const mineCount = value['mineCount'];
  if (
    typeof id !== 'string' ||
    !DIFFICULTY_IDS.includes(id) ||
    typeof name !== 'string' ||
    !isIntInRange(rows, 1, 100) ||
    !isIntInRange(cols, 1, 100) ||
    !isIntInRange(mineCount, 0, 10_000)
  ) {
    return null;
  }
  return { id: id as DifficultyId, name, rows, cols, mineCount };
}

function parseBoard(value: unknown, rows: number, cols: number): Board | null {
  if (!Array.isArray(value) || value.length !== rows) {
    return null;
  }
  const cells: Cell[][] = [];
  for (const rawRow of value) {
    if (!Array.isArray(rawRow) || rawRow.length !== cols) {
      return null;
    }
    const row: Cell[] = [];
    for (const rawCell of rawRow) {
      const cell = parseCell(rawCell);
      if (cell === null) {
        return null;
      }
      row.push(cell);
    }
    cells.push(row);
  }
  return cells;
}

/** 序列化：GameState → 带版本号的 JSON 字符串 */
export function serializeGame(state: GameState): string {
  const saved = {
    version: SAVE_VERSION,
    config: { ...state.config },
    board: state.board.map((row) => row.map((cell) => ({ ...cell }))),
    status: state.status,
    seed: state.seed,
    firstReveal: state.firstReveal === null ? null : { ...state.firstReveal },
    explodedAt: state.explodedAt === null ? null : { ...state.explodedAt },
    startedAt: state.startedAt,
    endedAt: state.endedAt,
  };
  return JSON.stringify(saved);
}

/** 反序列化：任意字符串 → GameState；非法 / 终态 / 版本不符返回 null（绝不抛异常） */
export function parseGame(json: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data)) {
    return null;
  }

  if (data['version'] !== SAVE_VERSION) {
    return null;
  }

  const config = parseConfig(data['config']);
  if (config === null) {
    return null;
  }

  const status = data['status'];
  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    return null;
  }

  const board = parseBoard(data['board'], config.rows, config.cols);
  if (board === null) {
    return null;
  }

  const seed = data['seed'];
  const firstReveal = data['firstReveal'];
  const explodedAt = data['explodedAt'];
  const startedAt = data['startedAt'];
  const endedAt = data['endedAt'];
  if (
    !isFiniteNumber(seed) ||
    !isNullableCoord(firstReveal) ||
    !isNullableCoord(explodedAt) ||
    (startedAt !== null && !isFiniteNumber(startedAt)) ||
    (endedAt !== null && !isFiniteNumber(endedAt))
  ) {
    return null;
  }

  return {
    config,
    board,
    status: status as GameState['status'],
    seed,
    firstReveal: firstReveal === null ? null : { r: firstReveal.r, c: firstReveal.c },
    explodedAt: explodedAt === null ? null : { r: explodedAt.r, c: explodedAt.c },
    startedAt,
    endedAt,
  };
}
