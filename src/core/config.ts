/**
 * 难度常量与查询（requirements §1.4 为唯一真源，本文件是其唯一代码实现）
 *
 * 自定义难度（FR-21）：经典 Windows 范围，宽 9–30、高 9–24、雷 10–668
 * 且雷数 ≤ (宽−1)×(高−1)。
 */
import type { DifficultyConfig, DifficultyId } from './types.js';

export const DIFFICULTIES: readonly DifficultyConfig[] = [
  { id: 'beginner', name: '初级', rows: 9, cols: 9, mineCount: 10 },
  { id: 'intermediate', name: '中级', rows: 16, cols: 16, mineCount: 40 },
  { id: 'expert', name: '高级', rows: 16, cols: 30, mineCount: 99 },
];

export const DEFAULT_DIFFICULTY_ID: DifficultyId = 'beginner';

/** 自定义难度参数边界（FR-21） */
export const CUSTOM_BOUNDS = {
  minCols: 9,
  maxCols: 30,
  minRows: 9,
  maxRows: 24,
  minMines: 10,
  maxMines: 668,
} as const;

/** 自定义难度校验结果（可判别联合，避免字符串错误传播） */
export type CustomValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** 校验自定义难度参数（FR-21 / EC-21 / EC-22） */
export function validateCustom(rows: number, cols: number, mineCount: number): CustomValidation {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || !Number.isInteger(mineCount)) {
    return { ok: false, reason: '宽、高、雷数必须是整数' };
  }
  if (cols < CUSTOM_BOUNDS.minCols || cols > CUSTOM_BOUNDS.maxCols) {
    return { ok: false, reason: `宽必须在 ${CUSTOM_BOUNDS.minCols}–${CUSTOM_BOUNDS.maxCols} 之间` };
  }
  if (rows < CUSTOM_BOUNDS.minRows || rows > CUSTOM_BOUNDS.maxRows) {
    return { ok: false, reason: `高必须在 ${CUSTOM_BOUNDS.minRows}–${CUSTOM_BOUNDS.maxRows} 之间` };
  }
  if (mineCount < CUSTOM_BOUNDS.minMines || mineCount > CUSTOM_BOUNDS.maxMines) {
    return {
      ok: false,
      reason: `雷数必须在 ${CUSTOM_BOUNDS.minMines}–${CUSTOM_BOUNDS.maxMines} 之间`,
    };
  }
  if (mineCount > (cols - 1) * (rows - 1)) {
    return { ok: false, reason: `雷数不能超过 (宽−1)×(高−1) = ${(cols - 1) * (rows - 1)}` };
  }
  return { ok: true };
}

/**
 * 构造自定义难度配置。
 * 参数非法时抛错（快速失败）；调用方应先经 `validateCustom` 得到友好错误。
 */
export function makeCustomDifficulty(rows: number, cols: number, mineCount: number): DifficultyConfig {
  const result = validateCustom(rows, cols, mineCount);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return { id: 'custom', name: '自定义', rows, cols, mineCount };
}

/** 按 id 取难度配置。id 非法时抛错（编程错误，应快速失败）。`custom` 请用 `makeCustomDifficulty` */
export function getDifficulty(id: DifficultyId): DifficultyConfig {
  const found = findDifficulty(id);
  if (found === undefined) {
    throw new Error(`Unknown difficulty id: ${String(id)}`);
  }
  return found;
}

/** 按 id 查内置难度配置，非法 id 或 `custom` 返回 undefined */
export function findDifficulty(id: string): DifficultyConfig | undefined {
  return DIFFICULTIES.find((d) => d.id === id);
}
