/**
 * 渲染器：状态 → 视图的纯映射（FR-03 / FR-10 / FR-12 / FR-13，章程 C8）
 *
 * 本模块只读取 GameState，绝不修改它，也不调用任何领域命令。
 */
import type { Board, Cell, GameState } from '../core/types.js';
import { getElapsedSeconds, getRemainingMines, MAX_ELAPSED_SECONDS } from '../core/game.js';
import type { HudElements } from './dom.js';
import { formatCount } from './format.js';

/** 渲染所需的只读视图（状态 + 当前时刻） */
export interface GameView {
  readonly state: GameState;
  readonly now: number;
}

type CellState =
  | 'hidden'
  | 'flag'
  | 'question'
  | 'empty'
  | 'number'
  | 'mine'
  | 'exploded'
  | 'wrong';

function cellState(cell: Cell, status: GameState['status'], isExplodedCell: boolean): CellState {
  if (cell.isRevealed) {
    if (!cell.isMine) {
      return cell.adjacent > 0 ? 'number' : 'empty';
    }
    // FR-12：只有玩家踩中的那一格是「踩中的地雷」，其余被揭示的地雷只是「地雷」
    return isExplodedCell ? 'exploded' : 'mine';
  }

  if (cell.mark === 'flag') {
    // 失败时「标了旗但不是雷」显示为错误标记（ADR-11 / OQ-01）
    return status === 'lost' ? 'wrong' : 'flag';
  }
  if (cell.mark === 'question') {
    return 'question';
  }
  return 'hidden';
}

function cellContent(state: CellState, adjacent: number): string {
  switch (state) {
    case 'flag':
    case 'wrong':
      return '🚩';
    case 'question':
      return '?';
    case 'number':
      return String(adjacent);
    case 'mine':
    case 'exploded':
      return '💣';
    default:
      return '';
  }
}

function cellLabel(state: CellState, r: number, c: number, adjacent: number): string {
  const position = `第 ${r + 1} 行第 ${c + 1} 列`;
  switch (state) {
    case 'flag':
      return `${position}，已标旗`;
    case 'wrong':
      return `${position}，错误标旗`;
    case 'question':
      return `${position}，问号标记`;
    case 'number':
      return `${position}，已翻开，${adjacent}`;
    case 'mine':
      return `${position}，地雷`;
    case 'exploded':
      return `${position}，踩中的地雷`;
    case 'empty':
      return `${position}，已翻开，空白`;
    default:
      return `${position}，未翻开`;
  }
}

function buildCell(
  cell: Cell,
  r: number,
  c: number,
  status: GameState['status'],
  explodedAt: { readonly r: number; readonly c: number } | null,
): HTMLButtonElement {
  const isExplodedCell = explodedAt !== null && explodedAt.r === r && explodedAt.c === c;
  const state = cellState(cell, status, isExplodedCell);

  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'cell';
  element.dataset['r'] = String(r);
  element.dataset['c'] = String(c);
  element.dataset['state'] = state;

  element.classList.add(cell.isRevealed ? 'is-revealed' : 'is-hidden');
  if (state === 'number') {
    element.classList.add('is-number', `is-adjacent-${cell.adjacent}`);
  }
  if (state === 'mine' || state === 'exploded') {
    element.classList.add('is-mine');
  }
  if (state === 'exploded') {
    element.classList.add('is-exploded');
  }
  if (state === 'wrong') {
    element.classList.add('is-wrong');
  }

  const content = document.createElement('span');
  content.className = 'cell__mark';
  content.textContent = cellContent(state, cell.adjacent);
  element.append(content);

  element.setAttribute('aria-label', cellLabel(state, r, c, cell.adjacent));
  return element;
}

function renderBoard(elements: HudElements, view: GameView): void {
  const { board, config, status, explodedAt } = view.state;

  elements.board.style.setProperty('--cols', String(config.cols));
  elements.board.style.setProperty('--rows', String(config.rows));
  elements.board.setAttribute('aria-rowcount', String(config.rows));
  elements.board.setAttribute('aria-colcount', String(config.cols));

  const fragment = document.createDocumentFragment();
  for (let r = 0; r < board.length; r += 1) {
    const row: Board[number] | undefined = board[r];
    if (row === undefined) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (cell === undefined) continue;
      fragment.append(buildCell(cell, r, c, status, explodedAt));
    }
  }

  elements.board.replaceChildren(fragment);
}

function faceFor(status: GameState['status']): string {
  switch (status) {
    case 'won':
      return '😎';
    case 'lost':
      return '😵';
    default:
      return '🙂';
  }
}

function statusText(view: GameView): { text: string; className: string } {
  const { status, explodedAt } = view.state;
  if (status === 'lost') {
    const at = explodedAt === null ? '' : `（第 ${explodedAt.r + 1} 行第 ${explodedAt.c + 1} 列）`;
    return { text: `💥 踩雷了${at}，按 R 再来一局`, className: 'is-lost' };
  }
  if (status === 'won') {
    return { text: `🎉 胜利！用时 ${getElapsedSeconds(view.state, view.now)} 秒`, className: 'is-won' };
  }
  return { text: '', className: '' };
}

function renderHud(elements: HudElements, view: GameView): void {
  elements.mineCounter.textContent = formatCount(getRemainingMines(view.state));
  elements.timer.textContent = formatCount(
    Math.min(MAX_ELAPSED_SECONDS, getElapsedSeconds(view.state, view.now)),
  );

  const { text, className } = statusText(view);
  elements.statusBar.textContent = text;
  elements.statusBar.className = className === '' ? 'status-bar' : `status-bar ${className}`;

  elements.faceIcon.textContent = faceFor(view.state.status);
}

/** 全量渲染（FR-03：每次状态变化都重新映射一遍，不做 diff） */
export function render(elements: HudElements, view: GameView): void {
  renderHud(elements, view);
  renderBoard(elements, view);
}

/** 切换难度按钮的选中态（FR-02） */
export function renderDifficulty(elements: HudElements, activeId: string): void {
  for (const node of elements.difficultyBar.querySelectorAll('.difficulty__btn')) {
    node.classList.toggle('is-active', node.getAttribute('data-difficulty') === activeId);
  }
}
