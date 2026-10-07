/**
 * HUD 数字格式化（FR-10 / FR-11）
 *
 * 规则（requirements §FR-10）：
 *   - 非负数：3 位补零，如 10 → "010"
 *   - 负数：'-' + 2 位补零，如 -1 → "-01"
 *   - 下限 -99，上限 999
 */
export function formatCount(value: number): string {
  const clamped = Math.max(-99, Math.min(999, Math.trunc(value)));
  if (clamped < 0) {
    return `-${String(Math.abs(clamped)).padStart(2, '0')}`;
  }
  return String(clamped).padStart(3, '0');
}
