/**
 * AC-A50 / AC-A51：存档序列化与反序列化（FR-20 / NFR-13 / EC-20）
 */
import { describe, expect, it } from 'vitest';
import { createGame, revealCell } from '../src/core/game.js';
import { makeCustomDifficulty, getDifficulty } from '../src/core/config.js';
import { parseGame, serializeGame } from '../src/core/persist.js';
import type { GameState } from '../src/core/types.js';

function roundTrip(state: GameState): GameState {
  const parsed = parseGame(serializeGame(state));
  if (parsed === null) {
    throw new Error('round-trip failed');
  }
  return parsed;
}

describe('serializeGame / parseGame 往返（AC-A50）', () => {
  it('ready 态无损往返', () => {
    const state = createGame(getDifficulty('beginner'), 42);
    const parsed = roundTrip(state);
    expect(parsed).toEqual(state);
  });

  it('playing 态无损往返（含首击、计时时间戳、已翻开、标记）', () => {
    let state = revealCell(createGame(getDifficulty('expert'), 123), 8, 15, 1_700_000_000_000);
    const parsed = roundTrip(state);
    expect(parsed).toEqual(state);
    expect(parsed.startedAt).toBe(1_700_000_000_000);
  });

  it('custom 配置无损往返（ADR-19）', () => {
    const custom = makeCustomDifficulty(20, 20, 60);
    let state = revealCell(createGame(custom, 7), 10, 10, 500);
    const parsed = roundTrip(state);
    expect(parsed.config).toEqual({ id: 'custom', name: '自定义', rows: 20, cols: 20, mineCount: 60 });
    expect(parsed).toEqual(state);
  });

  it('首击坐标与踩雷坐标往返', () => {
    let state = revealCell(createGame(getDifficulty('beginner'), 42), 4, 4, 0);
    const parsed = roundTrip(state);
    expect(parsed.firstReveal).toEqual({ r: 4, c: 4 });
    expect(parsed.explodedAt).toBeNull();
  });
});

describe('parseGame 健壮性（AC-A51 / NFR-13 / EC-20）', () => {
  it('损坏 JSON 返回 null', () => {
    expect(parseGame('{ not json')).toBeNull();
    expect(parseGame('')).toBeNull();
    expect(parseGame('42')).toBeNull();
    expect(parseGame('null')).toBeNull();
  });

  it('版本不匹配返回 null', () => {
    const state = createGame(getDifficulty('beginner'), 1);
    const data = JSON.parse(serializeGame(state)) as Record<string, unknown>;
    data['version'] = 999;
    expect(parseGame(JSON.stringify(data))).toBeNull();
  });

  it('终态存档返回 null（FR-20：终局不保存）', () => {
    const state = revealCell(createGame(getDifficulty('beginner'), 42), 4, 4, 0);
    const lost = revealCell(state, 0, 0, 5); // 0,0 可能是雷也可能不是，此处仅为结构演示
    const data = JSON.parse(serializeGame(lost)) as Record<string, unknown>;
    data['status'] = 'lost';
    expect(parseGame(JSON.stringify(data))).toBeNull();
    data['status'] = 'won';
    expect(parseGame(JSON.stringify(data))).toBeNull();
  });

  it('非法字段返回 null', () => {
    const state = createGame(getDifficulty('beginner'), 1);
    const base = JSON.parse(serializeGame(state)) as Record<string, unknown>;

    // 破坏 config.id
    const badId = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (badId['config'] as Record<string, unknown>)['id'] = 'impossible';
    expect(parseGame(JSON.stringify(badId))).toBeNull();

    // 破坏 mark
    const badMark = JSON.parse(JSON.stringify(base)) as { board: unknown[][] };
    (badMark.board[0]?.[0] as Record<string, unknown>)['mark'] = 'bogus';
    expect(parseGame(JSON.stringify(badMark))).toBeNull();

    // 破坏 seed
    const badSeed = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    badSeed['seed'] = 'abc';
    expect(parseGame(JSON.stringify(badSeed))).toBeNull();
  });

  it('棋盘尺寸与 config 不符返回 null', () => {
    const state = createGame(getDifficulty('beginner'), 1);
    const data = JSON.parse(serializeGame(state)) as { board: unknown[][] };
    data.board = data.board.slice(0, 5); // 9 行 → 5 行
    expect(parseGame(JSON.stringify(data))).toBeNull();
  });

  it('对任意输入绝不抛异常', () => {
    const garbage = ['', '{', '[1]', '{"version":1}', '{"a":{}}', 'undefined', 'NaN'];
    for (const input of garbage) {
      expect(() => parseGame(input)).not.toThrow();
    }
  });
});
