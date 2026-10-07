/**
 * AC-A01 / AC-A02：难度常量与默认值（FR-01 / FR-02，requirements §1.4 为唯一真源）
 * AC-A49：自定义难度校验（FR-21 / EC-21 / EC-22）
 */
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_BOUNDS,
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTIES,
  getDifficulty,
  makeCustomDifficulty,
  validateCustom,
} from '../src/core/config.js';

describe('难度常量', () => {
  it('三档难度与规范 §1.4 表格逐项一致（AC-A01）', () => {
    expect(DIFFICULTIES).toHaveLength(3);
    expect(DIFFICULTIES.map((d) => [d.id, d.rows, d.cols, d.mineCount])).toEqual([
      ['beginner', 9, 9, 10],
      ['intermediate', 16, 16, 40],
      ['expert', 16, 30, 99],
    ]);
  });

  it('默认难度为初级（AC-A02）', () => {
    expect(DEFAULT_DIFFICULTY_ID).toBe('beginner');
    expect(getDifficulty(DEFAULT_DIFFICULTY_ID).name).toBe('初级');
  });

  it('每档难度都有非空显示名', () => {
    for (const d of DIFFICULTIES) {
      expect(d.name.length).toBeGreaterThan(0);
    }
  });

  it('非法难度 id 抛错（快速失败）', () => {
    // 故意绕过类型约束，验证运行时防御
    expect(() => getDifficulty('impossible' as never)).toThrow(/Unknown difficulty/);
  });

  it('每档难度都留出足够的非雷格（可玩性下限）', () => {
    for (const d of DIFFICULTIES) {
      expect(d.rows * d.cols - d.mineCount).toBeGreaterThanOrEqual(d.rows * d.cols * 0.5);
    }
  });
});

describe('自定义难度校验（AC-A49 / FR-21）', () => {
  it('边界值合法（EC-22）', () => {
    expect(validateCustom(9, 9, 10)).toEqual({ ok: true });
    expect(validateCustom(24, 30, 667)).toEqual({ ok: true });
    expect(validateCustom(16, 16, 40)).toEqual({ ok: true });
  });

  it('越界值被拒（EC-21）', () => {
    // 宽越界
    expect(validateCustom(9, 8, 10).ok).toBe(false);
    expect(validateCustom(9, 31, 10).ok).toBe(false);
    // 高越界
    expect(validateCustom(8, 9, 10).ok).toBe(false);
    expect(validateCustom(25, 9, 10).ok).toBe(false);
    // 雷数越界
    expect(validateCustom(9, 9, 9).ok).toBe(false);
    expect(validateCustom(24, 30, 669).ok).toBe(false);
  });

  it('非整数被拒（EC-21）', () => {
    expect(validateCustom(9.5, 9, 10).ok).toBe(false);
    expect(validateCustom(9, 9, 10.1).ok).toBe(false);
    expect(validateCustom(Number.NaN, 9, 10).ok).toBe(false);
  });

  it('雷数超过 (宽−1)×(高−1) 被拒（EC-21）', () => {
    // 30×24 时 (29)×(23) = 667，668 超限
    expect(validateCustom(24, 30, 668).ok).toBe(false);
    expect(validateCustom(9, 9, 65).ok).toBe(false); // (8)×(8)=64
  });

  it('makeCustomDifficulty 产出 custom 配置；非法参数抛错', () => {
    const config = makeCustomDifficulty(20, 20, 60);
    expect(config).toEqual({ id: 'custom', name: '自定义', rows: 20, cols: 20, mineCount: 60 });
    expect(() => makeCustomDifficulty(9, 9, 100)).toThrow();
  });

  it('CUSTOM_BOUNDS 常量自洽', () => {
    expect(CUSTOM_BOUNDS.minCols).toBe(9);
    expect(CUSTOM_BOUNDS.maxCols).toBe(30);
    expect(CUSTOM_BOUNDS.minRows).toBe(9);
    expect(CUSTOM_BOUNDS.maxRows).toBe(24);
    expect(CUSTOM_BOUNDS.minMines).toBe(10);
    expect(CUSTOM_BOUNDS.maxMines).toBe(668);
  });
});
