import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Mantine/jsdom suites are CPU-heavy; avoid starving interaction tests on local machines.
    maxWorkers: 1,
    setupFiles: ['./tests/ui/setup.ts'],
    include: ['tests/ui/**/*.test.tsx'],
  },
});
