/**
 * 种子随机发生器（plan §4.1）
 *
 * 章程 C3 / NFR-04：领域层禁止直接使用 Math.random()，随机性必须由外部注入种子。
 * 同一 seed 在同一实现版本下必须产生完全相同的序列，以保证测试可重现。
 */

/**
 * mulberry32：32 位单状态 PRNG。
 * 分布质量足以满足「随机布雷」需求，且实现紧凑、无外部依赖。
 *
 * @returns 每次调用返回 [0, 1) 区间的下一个随机数
 */
export function createRng(seed: number): () => number {
  // 归一化到 32 位无符号整数，保证 seed = 1 与 seed = 1 + 2^32 行为一致
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // >>> 0 把结果转为 [0, 2^32) 的无符号整数，除以 2^32 得到 [0, 1)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates 洗牌，返回新数组（不修改入参，符合章程 C2）。
 *
 * **契约**：`items` 必须是不含 `undefined` 元素的紧凑数组。
 * 原因：交换实现用索引赋值，而 `noUncheckedIndexedAccess` 让读取结果为 `T | undefined`；
 * 若入参本身含 `undefined`，守卫将无法区分「数组空洞」与「真实元素」，
 * 从而可能静默产生错误排列。此约束在本项目内恒定成立（入参均为
 * `number[]` 索引候选集），越界时快速失败优于静默出错。
 */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const result = Array.from(items);

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) {
      throw new Error(
        `shuffle 入参含 undefined 或随机源返回越界值：i=${i}, j=${j}, length=${result.length}`,
      );
    }
    result[i] = b;
    result[j] = a;
  }

  return result;
}
