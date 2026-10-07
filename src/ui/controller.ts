/**
 * 事件控制器：把 DOM 事件翻译成领域命令（FR-04 / FR-08 / FR-14 / FR-15 / FR-16 / FR-17 / FR-19 / FR-21 / FR-22）
 *
 * 使用单一委托监听器，而不是为每个格子绑定监听器 ——
 * 高级难度有 480 个格子，逐格绑定既慢又容易泄漏。
 */
import { getDifficulty } from '../core/config.js';
import { chordReveal, cycleMark, newGame, revealCell } from '../core/game.js';
import type { DifficultyConfig, GameState } from '../core/types.js';
import { attachCustomPanel } from './custom-panel.js';
import { parseCoord, type HudElements } from './dom.js';
import { attachTouchGestures } from './gesture.js';
import { render, renderDifficulty, type GameView } from './renderer.js';
import { createTimer, type TimerHandle } from './timer.js';

/** 由调用方产生的随机种子（表现层是唯一允许读取时钟的层） */
function freshSeed(): number {
  return Date.now() >>> 0;
}

export interface ControllerOptions {
  /** 恢复的对局（持久化，FR-20）。缺省则按 initialConfig 开新局 */
  readonly initialState?: GameState;
  /** 每次状态变化后的回调（用于持久化，FR-20） */
  readonly onStateChange?: (state: GameState) => void;
}

export interface Controller {
  /** 以指定难度配置（与可选种子）开启新局 */
  startNewGame(config: DifficultyConfig, seed?: number): void;
  /** 恢复一个对局（持久化加载，FR-20） */
  restore(state: GameState): void;
  /** 受控动作：与鼠标/触屏点击走完全相同的领域命令路径（FR-18） */
  reveal(r: number, c: number): void;
  cycleMark(r: number, c: number): void;
  chord(r: number, c: number): void;
  getState(): GameState;
  getNow(): number;
}

export function createController(
  elements: HudElements,
  initialConfig: DifficultyConfig,
  initialSeed: number,
  options: ControllerOptions = {},
): Controller {
  let config: DifficultyConfig = options.initialState?.config ?? initialConfig;
  let state: GameState = options.initialState ?? newGame(config, initialSeed);
  let now = Date.now();
  const timer: TimerHandle = createTimer();

  function view(): GameView {
    return { state, now };
  }

  /** 按当前状态同步计时器：仅 playing 期间运行（FR-11） */
  function syncTimer(): void {
    if (state.status === 'playing') {
      timer.start(() => {
        now = Date.now();
        render(elements, view());
      });
    } else {
      timer.stop();
    }
  }

  function apply(next: GameState): void {
    state = next;
    now = Date.now();
    syncTimer();
    render(elements, view());
    options.onStateChange?.(state);
  }

  function startNewGame(nextConfig: DifficultyConfig, seed?: number): void {
    config = nextConfig;
    timer.stop();
    now = Date.now();
    state = newGame(config, seed ?? freshSeed());
    renderDifficulty(elements, config.id);
    syncTimer();
    render(elements, view());
    options.onStateChange?.(state);
  }

  function restore(nextState: GameState): void {
    config = nextState.config;
    state = nextState;
    now = Date.now();
    renderDifficulty(elements, config.id);
    syncTimer();
    render(elements, view());
    // 注意：恢复不触发 onStateChange —— 我们正在「读取」存档，而非产生新状态
  }

  function reveal(r: number, c: number): void {
    now = Date.now();
    apply(revealCell(state, r, c, now));
  }

  function mark(r: number, c: number): void {
    apply(cycleMark(state, r, c));
  }

  function chord(r: number, c: number): void {
    now = Date.now();
    apply(chordReveal(state, r, c, now));
  }

  // ---- 移动端长按手势（FR-22 / NFR-14）----

  const gesture = attachTouchGestures(elements.board, (r, c) => {
    mark(r, c);
  });

  // ---- 事件委托 ----

  elements.board.addEventListener('click', (event) => {
    // 长按标旗后浏览器会合成一次 click，需抑制以免误翻开（EC-23）
    if (Date.now() - gesture.lastLongPressAt() < 500) {
      return;
    }
    const coord = parseCoord(event.target);
    if (coord !== null) {
      reveal(coord.r, coord.c);
    }
  });

  // FR-17：抑制浏览器右键菜单，改为标记循环（鼠标右键）。
  // 触屏长按已由 gesture 处理，此处跳过以免重复标记。
  elements.board.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (Date.now() - gesture.lastLongPressAt() < 500) {
      return;
    }
    const coord = parseCoord(event.target);
    if (coord !== null) {
      mark(coord.r, coord.c);
    }
  });

  // FR-19：双击触发和弦（仅桌面；触屏上双击不应和弦，见 OQ-08）
  elements.board.addEventListener('dblclick', (event) => {
    if (Date.now() - gesture.lastTouchEndAt() < 500) {
      return;
    }
    const coord = parseCoord(event.target);
    if (coord !== null) {
      chord(coord.r, coord.c);
    }
  });

  // FR-19：中键（auxclick button 1）触发和弦
  elements.board.addEventListener('auxclick', (event) => {
    if (event.button !== 1) {
      return;
    }
    const coord = parseCoord(event.target);
    if (coord !== null) {
      chord(coord.r, coord.c);
    }
  });

  // 阻止中键自动滚动
  elements.board.addEventListener('mousedown', (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  // FR-21：自定义难度面板（读取表单 → 校验 → 开局）
  const customPanel = attachCustomPanel(elements, (nextConfig) => {
    startNewGame(nextConfig);
  });

  // FR-02 / FR-14 / FR-21：难度切换
  elements.difficultyBar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('.difficulty__btn');
    if (button === null) {
      return;
    }
    const id = button.getAttribute('data-difficulty');
    if (id === 'custom') {
      customPanel.toggle();
      return;
    }
    if (id !== null) {
      customPanel.hide();
      startNewGame(getDifficulty(id as 'beginner' | 'intermediate' | 'expert'));
    }
  });

  // FR-15：重新开始（保持当前难度）
  elements.restartBtn.addEventListener('click', () => {
    startNewGame(config);
  });

  // FR-15 的便利入口：键盘 R
  window.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      startNewGame(config);
    }
  });

  // 首次渲染
  renderDifficulty(elements, config.id);
  render(elements, view());

  return {
    startNewGame,
    restore,
    reveal,
    cycleMark: mark,
    chord,
    getState: () => state,
    getNow: () => now,
  };
}
