/**
 * 领域层类型契约（plan §3）
 *
 * 全部字段 readonly —— 从类型层面强制不可变（章程 C2）。
 * 本文件不得引用任何 DOM API（章程 C1 / NFR-03）。
 */

/** 玩家在未翻开格子上施加的标记态（FR-08） */
export type Mark = 'none' | 'flag' | 'question';

/** 局面状态机（requirements §7） */
export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

/** 难度标识（含玩家自定义） */
export type DifficultyId = 'beginner' | 'intermediate' | 'expert' | 'custom';

/** 难度配置（requirements §1.4 为唯一真源） */
export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
  readonly mineCount: number;
}

/** 棋盘坐标 */
export interface Coord {
  readonly r: number;
  readonly c: number;
}

/** 单元格 */
export interface Cell {
  /** 是否地雷。`ready` 阶段恒为 false（延后布雷，ADR-01） */
  readonly isMine: boolean;
  /** 是否已翻开 */
  readonly isRevealed: boolean;
  /** 玩家标记态 */
  readonly mark: Mark;
  /** 相邻雷数 0–8。`ready` 阶段恒为 0（未计算） */
  readonly adjacent: number;
}

/** 棋盘：board[r][c] */
export type Board = readonly (readonly Cell[])[];

/** 一局的完整状态 */
export interface GameState {
  readonly config: DifficultyConfig;
  readonly board: Board;
  readonly status: GameStatus;
  readonly seed: number;
  /** 首击坐标，null 表示尚未首击 */
  readonly firstReveal: Coord | null;
  /** 踩雷坐标 */
  readonly explodedAt: Coord | null;
  /** 计时起点时间戳（ms） */
  readonly startedAt: number | null;
  /** 计时终点时间戳（ms） */
  readonly endedAt: number | null;
}
