import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['app/_lib/**/__tests__/**/*.test.ts'],
  },
});
