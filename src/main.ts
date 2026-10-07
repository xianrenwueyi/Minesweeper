/**
 * 应用入口：装配领域层与表现层（plan §1.2 单向数据流），接入进度持久化（FR-20）
 */
import './style.css';
import './ui/grid.css';
import { DEFAULT_DIFFICULTY_ID, getDifficulty } from './core/config.js';
import { installHooks } from './debug/hooks.js';
import { createController } from './ui/controller.js';
import { queryHudElements } from './ui/dom.js';
import { loadGame, saveGame } from './ui/storage.js';

function bootstrap(): void {
  const elements = queryHudElements();

  // FR-20：尝试恢复进行中的对局；否则以默认难度开局
  const saved = loadGame();

  // 种子在表现层产生：领域层保持纯净可测（章程 C3 / ADR-05）
  const seed = Date.now() >>> 0;
  const controller = createController(
    elements,
    saved?.config ?? getDifficulty(DEFAULT_DIFFICULTY_ID),
    seed,
    // exactOptionalPropertyTypes：显式传 undefined 会报错，故条件构造
    saved === null
      ? { onStateChange: saveGame }
      : { initialState: saved, onStateChange: saveGame },
  );

  // FR-18：暴露验收契约
  installHooks(controller);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
