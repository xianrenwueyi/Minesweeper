/**
 * 触屏长按手势检测（FR-22 / ADR-20 / NFR-14）
 *
 * 用 Pointer Events（`pointerType === 'touch'`）实现，理由：
 *   - PointerEvent 可构造、有 clientX/Y，既适合真机也便于验收脚本注入。
 *   - 天然不干扰鼠标路径（mouse 的 pointer 事件被本模块直接忽略）。
 *
 * 行为：按住 ≥ longPressMs 且位移 ≤ moveThreshold → 触发 onLongPress；
 *       位移超阈值（滚动）或 pointerup/pointercancel → 取消。
 */
import { parseCoord } from './dom.js';

export interface TouchGestureHandle {
  /** 最近一次长按触发的时刻（epoch ms），用于抑制随后的合成 click */
  lastLongPressAt(): number;
  /** 最近一次 touch 结束的时刻（epoch ms），用于抑制触屏上的 dblclick 和弦 */
  lastTouchEndAt(): number;
}

export interface TouchGestureOptions {
  readonly longPressMs?: number;
  readonly moveThreshold?: number;
}

export function attachTouchGestures(
  board: HTMLElement,
  onLongPress: (r: number, c: number) => void,
  options: TouchGestureOptions = {},
): TouchGestureHandle {
  const longPressMs = options.longPressMs ?? 500;
  const moveThreshold = options.moveThreshold ?? 10;

  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let activeCoord: { r: number; c: number } | null = null;
  let moved = false;
  let lastLongPressAt = 0;
  let lastTouchEndAt = 0;

  function clearTimer(): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  board.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') {
      return;
    }
    const coord = parseCoord(event.target);
    if (coord === null) {
      return;
    }
    // 新手势开始：清除上一次长按留下的抑制窗口，
    // 否则「长按标旗 → 立刻点击另一格翻开」中的点击会被误吞。
    lastLongPressAt = 0;
    activeCoord = coord;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    clearTimer();
    timer = window.setTimeout(() => {
      if (!moved && activeCoord !== null) {
        lastLongPressAt = Date.now();
        onLongPress(activeCoord.r, activeCoord.c);
        // 震动是可选增强：无用户激活时部分浏览器会拒绝，绝不能让它变成未捕获异常
        try {
          navigator.vibrate?.(30);
        } catch {
          // 忽略
        }
      }
    }, longPressMs);
  });

  board.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch' || activeCoord === null) {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx * dx + dy * dy > moveThreshold * moveThreshold) {
      moved = true;
      clearTimer();
    }
  });

  const finish = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      lastTouchEndAt = Date.now();
    }
    clearTimer();
    activeCoord = null;
  };
  board.addEventListener('pointerup', finish);
  board.addEventListener('pointercancel', finish);

  return {
    lastLongPressAt: () => lastLongPressAt,
    lastTouchEndAt: () => lastTouchEndAt,
  };
}
