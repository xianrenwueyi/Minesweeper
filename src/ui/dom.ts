/**
 * DOM 元素契约（plan §5.1 / §5.2）
 *
 * 缺失元素时快速失败 —— 装配错误应当在开发期立刻暴露，而不是等到运行时静默失效。
 */

export interface HudElements {
  readonly board: HTMLElement;
  readonly mineCounter: HTMLElement;
  readonly timer: HTMLElement;
  readonly statusBar: HTMLElement;
  readonly restartBtn: HTMLButtonElement;
  readonly faceIcon: HTMLElement;
  readonly difficultyBar: HTMLElement;
  readonly customPanel: HTMLElement;
  readonly customCols: HTMLInputElement;
  readonly customRows: HTMLInputElement;
  readonly customMines: HTMLInputElement;
  readonly customError: HTMLElement;
  readonly customStart: HTMLButtonElement;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`缺少必需的元素 #${id}（index.html 与 renderer 的契约被破坏）`);
  }
  return element as T;
}

/** 查询并校验全部 HUD 元素 */
export function queryHudElements(): HudElements {
  return {
    board: requireElement('board'),
    mineCounter: requireElement('mine-counter'),
    timer: requireElement('timer'),
    statusBar: requireElement('status-bar'),
    restartBtn: requireElement<HTMLButtonElement>('restart-btn'),
    faceIcon: requireElement('face-icon'),
    difficultyBar: requireElement('difficulty-bar'),
    customPanel: requireElement('custom-panel'),
    customCols: requireElement<HTMLInputElement>('custom-cols'),
    customRows: requireElement<HTMLInputElement>('custom-rows'),
    customMines: requireElement<HTMLInputElement>('custom-mines'),
    customError: requireElement('custom-error'),
    customStart: requireElement<HTMLButtonElement>('custom-start'),
  };
}

/** 从事件目标解析出格子坐标（供点击/右键/和弦/长按共用） */
export function parseCoord(target: EventTarget | null): { r: number; c: number } | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const cell = target.closest('.cell');
  if (cell === null || !(cell instanceof HTMLElement)) {
    return null;
  }
  const r = Number(cell.dataset['r']);
  const c = Number(cell.dataset['c']);
  if (!Number.isInteger(r) || !Number.isInteger(c)) {
    return null;
  }
  return { r, c };
}
