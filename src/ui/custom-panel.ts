/**
 * 自定义难度面板（FR-21）
 *
 * 自 controller.ts 拆出，以满足 NFR-07（单文件 ≤ 250 行）。
 * 职责边界：只做「读取表单 → 校验 → 回调」；不开局、不渲染、不碰领域规则。
 */
import { makeCustomDifficulty, validateCustom } from '../core/config.js';
import type { DifficultyConfig } from '../core/types.js';
import type { HudElements } from './dom.js';

export interface CustomPanel {
  /** 切换面板显隐（显示时预填上次参数） */
  toggle(): void;
  /** 收起面板（切换到预设难度时调用） */
  hide(): void;
}

export function attachCustomPanel(
  elements: HudElements,
  onStart: (config: DifficultyConfig) => void,
): CustomPanel {
  /** 记住玩家上次的自定义参数（ADR：预填优于每次重输） */
  const last = { rows: 16, cols: 16, mineCount: 40 };

  function hide(): void {
    elements.customPanel.hidden = true;
  }

  function prefill(): void {
    elements.customCols.value = String(last.cols);
    elements.customRows.value = String(last.rows);
    elements.customMines.value = String(last.mineCount);
    elements.customError.textContent = '';
  }

  function toggle(): void {
    const willShow = elements.customPanel.hidden;
    if (willShow) {
      prefill();
    }
    elements.customPanel.hidden = !willShow;
  }

  function submit(): void {
    const cols = Number(elements.customCols.value);
    const rows = Number(elements.customRows.value);
    const mines = Number(elements.customMines.value);

    const result = validateCustom(rows, cols, mines);
    if (!result.ok) {
      // 非法参数：显示原因且不开局（EC-21）
      elements.customError.textContent = result.reason;
      return;
    }

    last.cols = cols;
    last.rows = rows;
    last.mineCount = mines;
    elements.customError.textContent = '';
    hide();
    onStart(makeCustomDifficulty(rows, cols, mines));
  }

  elements.customStart.addEventListener('click', submit);
  elements.customPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  return { toggle, hide };
}
