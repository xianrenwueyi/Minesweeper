/**
 * 计时器驱动（FR-11 / ADR-08）
 *
 * 心跳只负责「请求重绘」，不参与时间计算 —— 时间真源是 GameState 中的时间戳，
 * 因此 setInterval 的漂移不会累计成误差，标签页挂起后回到前台时间依然正确。
 */

/** 重绘心跳周期（ms）。250ms 使秒数跳变最多延迟 0.25s，视觉上不「卡秒」。 */
export const TIMER_TICK_MS = 250;

export interface TimerHandle {
  start(onTick: () => void): void;
  stop(): void;
  isRunning(): boolean;
}

export function createTimer(intervalMs: number = TIMER_TICK_MS): TimerHandle {
  let handle: number | null = null;

  return {
    start(onTick: () => void): void {
      if (handle !== null) {
        return;
      }
      handle = window.setInterval(onTick, intervalMs);
    },

    stop(): void {
      if (handle === null) {
        return;
      }
      window.clearInterval(handle);
      handle = null;
    },

    isRunning(): boolean {
      return handle !== null;
    },
  };
}
