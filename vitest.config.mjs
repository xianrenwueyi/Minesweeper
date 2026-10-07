import { defineConfig } from 'vitest/config';

// 领域层（src/core/**）无 DOM 依赖，因此测试跑在 node 环境（plan §8）
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      // ADR-13：纯类型声明文件不含运行时代码，计入分母会以 0% 拉低整体覆盖率（度量口径错误）
      exclude: ['src/core/types.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 90,
        branches: 85,
      },
    },
  },
});
