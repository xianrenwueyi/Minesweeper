/**
 * AC-A05 / AC-A06：种子随机发生器（NFR-04，章程 C3）
 */
import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '../src/core/rng.js';

function take(seed: number, n: number): number[] {
  const rand = createRng(seed);
  return Array.from({ length: n }, () => rand());
}

describe('createRng', () => {
  it('相同种子产生完全相同的序列（AC-A05 / 章程 C3）', () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });

  it('不同种子产生不同的序列', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('全部输出落在 [0, 1) 区间（AC-A05）', () => {
    for (const seed of [0, 1, 7, 42, 12345, 4294967295]) {
      const rand = createRng(seed);
      for (let i = 0; i < 500; i += 1) {
        const value = rand();
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('seed 超出 32 位范围时按 >>>0 归一化，行为与等价值一致', () => {
    expect(take(1, 10)).toEqual(take(1 + 2 ** 32, 10));
  });

  it('分布不明显偏斜（10000 次采样均值接近 0.5）', () => {
    const rand = createRng(2024);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i += 1) {
      sum += rand();
    }
    expect(sum / n).toBeGreaterThan(0.47);
    expect(sum / n).toBeLessThan(0.53);
  });
});

describe('shuffle', () => {
  it('返回同元素排列且长度不变（AC-A06）', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const output = shuffle(input, createRng(7));
    expect(output).toHaveLength(input.length);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
  });

  it('不修改入参（章程 C2）', () => {
    const input = Object.freeze([1, 2, 3, 4, 5]);
    const snapshot = [...input];
    shuffle(input, createRng(3));
    expect([...input]).toEqual(snapshot);
  });

  it('相同种子产生相同排列（可重现）', () => {
    const input = Array.from({ length: 40 }, (_, i) => i);
    expect(shuffle(input, createRng(99))).toEqual(shuffle(input, createRng(99)));
  });

  it('确实是打乱而非恒等（对 100 元素样本）', () => {
    const input = Array.from({ length: 100 }, (_, i) => i);
    expect(shuffle(input, createRng(5))).not.toEqual(input);
  });

  it('处理空数组与单元素数组', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle(['a'], createRng(1))).toEqual(['a']);
  });

  it('随机源返回越界值时快速失败，而不是静默产生空洞', () => {
    // 防御性契约：rand() 必须落在 [0,1)。越界说明调用方有 bug，应立刻暴露。
    expect(() => shuffle([1, 2, 3], () => 1.5)).toThrow(/shuffle 入参含 undefined 或随机源返回越界值/);
  });

  it('含 undefined 元素的数组（含稀疏数组）被明确拒绝，而非静默产生错误排列', () => {
    // 契约：入参必须是不含 undefined 的紧凑数组。
    // 稀疏数组经 Array.from 会把空洞变成显式 undefined，因此也落入该契约的拒绝范围。
    const sparse = [1, , 3] as unknown as number[];
    expect(() => shuffle(sparse, createRng(1))).toThrow(/shuffle 入参含 undefined/);
    expect(() => shuffle([1, undefined, 3] as unknown as number[], createRng(1))).toThrow(
      /shuffle 入参含 undefined/,
    );
  });
});
