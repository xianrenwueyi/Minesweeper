/**
 * AC-A19 ~ AC-A27、AC-A40：状态机与命令（FR-04 / FR-12 / FR-13 / EC-01 / EC-03 / EC-09 / EC-10 / EC-12）
 */
import { describe, expect, it } from 'vitest';
import {
  createGame,
  cycleMark,
  getRemainingMines,
  getRevealedCount,
  isTerminal,
  newGame,
  recomputeAdjacency,
  revealCell,
} from '../src/core/game.js';
import { getCell, layMines } from '../src/core/board.js';
import { DIFFICULTIES, getDifficulty } from '../src/core/config.js';
import type { Board, Cell, Coord, GameState } from '../src/core/types.js';

const BEGINNER = getDifficulty('beginner');
const EXPERT = getDifficulty('expert');

function mustCell(board: Board, r: number, c: number): Cell {
  const cell = getCell(board, r, c);
  if (cell === undefined) {
    throw new Error(`expected a cell at (${r}, ${c})`);
  }
  return cell;
}

function findMine(board: Board): Coord {
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    if (row === undefined) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]?.isMine === true) {
        return { r, c };
      }
    }
  }
  throw new Error('no mine found on board');
}

function findHiddenSafe(board: Board): Coord {
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    if (row === undefined) continue;
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (cell !== undefined && !cell.isMine && !cell.isRevealed) {
        return { r, c };
      }
    }
  }
  throw new Error('no hidden safe cell found');
}

function countMines(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine) n += 1;
    }
  }
  return n;
}

function countMinesRevealed(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine && cell.isRevealed) n += 1;
    }
  }
  return n;
}

describe('createGame / newGame（AC-A19 前置）', () => {
  it('ready 阶段的棋盘不含任何地雷（延后布雷，ADR-01）', () => {
    const state = createGame(BEGINNER, 42);
    expect(state.status).toBe('ready');
    expect(countMines(state.board)).toBe(0);
    expect(state.firstReveal).toBeNull();
    expect(state.explodedAt).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.endedAt).toBeNull();
  });

  it('newGame 保留传入的种子（章程 C3）', () => {
    expect(newGame(EXPERT, 987).seed).toBe(987);
  });

  it('newGame 是同种子的确定性函数', () => {
    expect(newGame(BEGINNER, 5)).toEqual(newGame(BEGINNER, 5));
  });

  it('ready 阶段 isTerminal 为 false', () => {
    expect(isTerminal(createGame(BEGINNER, 1))).toBe(false);
  });
});

describe('revealCell：ready → playing（AC-A19 / AC-A20）', () => {
  it('首次翻开后转入 playing 并记录 startedAt 与 firstReveal', () => {
    const state = revealCell(createGame(BEGINNER, 42), 4, 4, 1000);
    expect(state.status).toBe('playing');
    expect(state.startedAt).toBe(1000);
    expect(state.firstReveal).toEqual({ r: 4, c: 4 });
    expect(state.endedAt).toBeNull();
  });

  it('首次翻开后雷数精确，且首击格不是雷（AC-A20：不存在 ready → lost）', () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const state = revealCell(createGame(BEGINNER, seed), 0, 0, 0);
      expect(state.status).not.toBe('lost');
      expect(countMines(state.board)).toBe(BEGINNER.mineCount);
      expect(mustCell(state.board, 0, 0).isMine).toBe(false);
      expect(mustCell(state.board, 0, 0).isRevealed).toBe(true);
    }
  });

  it('三难度下首击位置全覆盖，均不失败（AC-A20）', () => {
    for (const cfg of DIFFICULTIES) {
      for (const seed of [11, 22, 33]) {
        const spots: Coord[] = [
          { r: 0, c: 0 },
          { r: 0, c: cfg.cols - 1 },
          { r: cfg.rows - 1, c: 0 },
          { r: cfg.rows - 1, c: cfg.cols - 1 },
          { r: cfg.rows >> 1, c: cfg.cols >> 1 },
        ];
        for (const spot of spots) {
          const state = revealCell(createGame(cfg, seed), spot.r, spot.c, 0);
          expect(state.status).toBe('playing');
        }
      }
    }
  });

  it('越界坐标为空操作', () => {
    const state = createGame(BEGINNER, 42);
    expect(revealCell(state, -1, 0, 0)).toBe(state);
    expect(revealCell(state, 0, 999, 0)).toBe(state);
    expect(revealCell(state, 1.5, 1, 0)).toBe(state);
  });
});

describe('revealCell：失败结算（AC-A21）', () => {
  it('翻开地雷后状态为 lost、记录爆炸坐标、揭示全部地雷', () => {
    const started = revealCell(createGame(BEGINNER, 42), 4, 4, 0);
    const mine = findMine(started.board);
    const lost = revealCell(started, mine.r, mine.c, 5000);

    expect(lost.status).toBe('lost');
    expect(lost.explodedAt).toEqual(mine);
    expect(lost.endedAt).toBe(5000);
    expect(countMinesRevealed(lost.board)).toBe(BEGINNER.mineCount);
    expect(isTerminal(lost)).toBe(true);
  });

  it('失败后 explodedAt 指向玩家踩中的那一格（唯一高亮的依据）', () => {
    const started = revealCell(createGame(EXPERT, 9), 8, 15, 0);
    const mines: Coord[] = [];
    for (let r = 0; r < EXPERT.rows; r += 1) {
      for (let c = 0; c < EXPERT.cols; c += 1) {
        if (mustCell(started.board, r, c).isMine) mines.push({ r, c });
      }
    }
    const chosen = mines[mines.length - 1];
    if (chosen === undefined) throw new Error('expected mines');
    const lost = revealCell(started, chosen.r, chosen.c, 1);
    expect(lost.explodedAt).toEqual(chosen);
  });

  it('失败不改变地雷总数（揭示不等于新增）', () => {
    const started = revealCell(createGame(BEGINNER, 3), 4, 4, 0);
    const mine = findMine(started.board);
    const lost = revealCell(started, mine.r, mine.c, 0);
    expect(countMines(lost.board)).toBe(BEGINNER.mineCount);
  });
});

describe('revealCell：胜利结算（AC-A22 / AC-A23 / AC-A24）', () => {
  it('翻开全部非雷格后状态为 won 且记录 endedAt（AC-A22）', () => {
    let state = revealCell(createGame(BEGINNER, 42), 0, 0, 100);
    const safeTotal = BEGINNER.rows * BEGINNER.cols - BEGINNER.mineCount;

    // 逐一翻开剩余的隐藏安全格；在此过程中绝不应踩雷
    for (let r = 0; r < BEGINNER.rows; r += 1) {
      for (let c = 0; c < BEGINNER.cols; c += 1) {
        const cell = mustCell(state.board, r, c);
        if (!cell.isMine && !cell.isRevealed) {
          state = revealCell(state, r, c, 200);
        }
      }
    }

    expect(state.status).toBe('won');
    expect(state.endedAt).toBe(200);
    expect(getRevealedCount(state.board)).toBe(safeTotal);
    expect(isTerminal(state)).toBe(true);
  });

  it('胜利与旗帜数量无关（AC-A23 / EC-09）：带问号的局面同样判胜', () => {
    // 用「先布雷再逐格翻开」的方式构造确定性胜利局面
    let state = revealCell(createGame(BEGINNER, 42), 0, 0, 0);

    // 在若干未翻开的安全格上打问号：标记不得影响胜负判定
    const marks: Coord[] = [
      { r: 1, c: 1 },
      { r: 2, c: 2 },
      { r: 3, c: 3 },
    ];
    for (const m of marks) {
      const cell = mustCell(state.board, m.r, m.c);
      if (!cell.isMine && !cell.isRevealed) {
        state = cycleMark(state, m.r, m.c);
      }
    }

    for (let r = 0; r < BEGINNER.rows; r += 1) {
      for (let c = 0; c < BEGINNER.cols; c += 1) {
        const cell = mustCell(state.board, r, c);
        if (!cell.isMine && !cell.isRevealed) {
          state = revealCell(state, r, c, 10);
        }
      }
    }
    expect(state.status).toBe('won');
    expect(getRevealedCount(state.board)).toBe(BEGINNER.rows * BEGINNER.cols - BEGINNER.mineCount);
  });

  it('一次翻开恰好完成最后一个安全格时判胜而非判负（AC-A24 / EC-10）', () => {
    // 搜索一个「首击即胜利」的种子，检验结算顺序：先展开→再判胜
    let found: GameState | null = null;
    for (let seed = 1; seed <= 5000; seed += 1) {
      const candidate = revealCell(createGame(BEGINNER, seed), 4, 4, 0);
      if (candidate.status === 'won') {
        found = candidate;
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(found?.status).toBe('won');
    expect(found?.explodedAt).toBeNull();
    expect(found?.endedAt).toBe(0);
  });

  it('胜利时为所有地雷补旗，使剩余雷数归零（ADR-12 / OQ-02）', () => {
    const safeTotal = BEGINNER.rows * BEGINNER.cols - BEGINNER.mineCount;
    let state = revealCell(createGame(BEGINNER, 42), 0, 0, 0);

    for (let r = 0; r < BEGINNER.rows; r += 1) {
      for (let c = 0; c < BEGINNER.cols; c += 1) {
        const cell = getCell(state.board, r, c);
        if (cell === undefined) continue;
        if (cell.isMine || cell.isRevealed) continue;
        state = revealCell(state, r, c, 10);
      }
    }

    expect(state.status).toBe('won');
    expect(getRevealedCount(state.board)).toBe(safeTotal);

    let mines = 0;
    let flaggedMines = 0;
    for (const row of state.board) {
      for (const cell of row) {
        if (cell.isMine) {
          mines += 1;
          if (cell.mark === 'flag') flaggedMines += 1;
        } else {
          // 非雷格不得被补旗
          expect(cell.mark).toBe('none');
        }
      }
    }
    expect(mines).toBe(BEGINNER.mineCount);
    expect(flaggedMines).toBe(BEGINNER.mineCount);
    expect(getRemainingMines(state)).toBe(0);
  });
});

describe('revealCell：空操作语义（AC-A25 / AC-A26 / AC-A40）', () => {
  it('对已翻开格再次翻开是空操作，返回同一个状态对象（AC-A25 / EC-01）', () => {
    const state = revealCell(createGame(BEGINNER, 42), 4, 4, 0);
    expect(revealCell(state, 4, 4, 999)).toBe(state);
  });

  it('连续快速翻开同一格是幂等的（AC-A40 / EC-12）', () => {
    const state = revealCell(createGame(BEGINNER, 42), 2, 2, 0);
    const once = revealCell(state, 7, 7, 1);
    const twice = revealCell(once, 7, 7, 2);
    expect(twice).toBe(once);
    expect(twice.endedAt).toBe(once.endedAt);
  });

  it('终态下翻开任意格是空操作（AC-A26 / EC-03）', () => {
    const started = revealCell(createGame(BEGINNER, 42), 4, 4, 0);
    const mine = findMine(started.board);
    const lost = revealCell(started, mine.r, mine.c, 0);
    expect(revealCell(lost, 0, 0, 10)).toBe(lost);
    expect(revealCell(lost, mine.r, mine.c, 10)).toBe(lost);
  });

  it('失败后翻开一个未翻开的安全格不会改变终态（AC-A26）', () => {
    const started = revealCell(createGame(EXPERT, 123), 8, 15, 0);
    const mine = findMine(started.board);
    const lost = revealCell(started, mine.r, mine.c, 0);
    const hiddenSafe = findHiddenSafe(lost.board);
    expect(revealCell(lost, hiddenSafe.r, hiddenSafe.c, 5)).toBe(lost);
  });
});

describe('不可变性（AC-A27 / 章程 C2）', () => {
  it('revealCell 不修改传入的 state', () => {
    const state = createGame(BEGINNER, 42);
    const snapshot = JSON.parse(JSON.stringify(state)) as unknown;
    revealCell(state, 4, 4, 0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('revealCell 不修改传入的 board 行数组', () => {
    const started = revealCell(createGame(BEGINNER, 42), 4, 4, 0);
    const before = started.board.map((row) => row.map((cell) => cell.isRevealed));
    revealCell(started, 0, 8, 100);
    const after = started.board.map((row) => row.map((cell) => cell.isRevealed));
    expect(after).toEqual(before);
  });
});

describe('recomputeAdjacency 兜底工具', () => {
  it('对已布雷棋盘重算后结果与 layMines 的 adjacent 一致', () => {
    const board = layMines(BEGINNER.rows, BEGINNER.cols, BEGINNER.mineCount, { r: 4, c: 4 }, 42);
    const zeroed: Board = board.map((row) => row.map((cell) => ({ ...cell, adjacent: 0 })));
    expect(recomputeAdjacency(zeroed)).toEqual(board);
  });
});
