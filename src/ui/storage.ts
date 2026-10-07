/**
 * localStorage 读写封装（FR-20）
 *
 * 职责边界（ADR-21）：
 *   - 序列化/反序列化与 schema 校验在 `src/core/persist.ts`（纯函数）。
 *   - 本文件负责与 localStorage 交互（含键名这一存储层细节）并兜底处理不可用/损坏的情况（NFR-13）。
 */
import { parseGame, serializeGame } from '../core/persist.js';
import type { GameState } from '../core/types.js';

/** 存档键名。含版本号，便于未来结构变更时与旧档隔离。 */
export const SAVE_KEY = 'minesweeper.save.v1';

/**
 * 保存对局。
 * - 终态（won/lost）按 FR-20 不保存，转为清除存档。
 * - localStorage 不可用（隐私模式 / 配额 / 沙箱）时静默忽略，绝不抛出。
 */
export function saveGame(state: GameState): void {
  try {
    if (state.status === 'won' || state.status === 'lost') {
      clearGame();
      return;
    }
    window.localStorage.setItem(SAVE_KEY, serializeGame(state));
  } catch {
    // 静默降级：持久化失败不影响当前对局
  }
}

/** 读取并校验存档；无存档 / 损坏 / 非法时返回 null（绝不抛出） */
export function loadGame(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw === null) {
      return null;
    }
    return parseGame(raw);
  } catch {
    return null;
  }
}

/** 清除存档；失败静默 */
export function clearGame(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // 静默
  }
}
