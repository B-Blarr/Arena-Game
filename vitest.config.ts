import { defineConfig } from 'vitest/config';

// Getrennt von vite.config.ts: die Unit-Tests laufen in der Node-Umgebung
// (reine Logik — RNG, Balance-Formeln, Save-Sanitizer), ohne den Spiel-Build.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
