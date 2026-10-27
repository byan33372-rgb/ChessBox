import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // 集成测试启动真实服务器+原生模块(better-sqlite3)：
          // forks 进程池 + 串行文件，规避线程池下 tinypool 崩溃（ERR_IPC_CHANNEL_CLOSED）
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
