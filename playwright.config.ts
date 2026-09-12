import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: { command: 'npm run build && npm run preview', port: 4173 },
  testMatch: '**/*.e2e.{ts,js}',
  // WebGL через SwiftShader жрёт CPU: параллель роняет RAF-тайминги
  // и даёт ложные падения. Серийно + один ретрай на флейк.
  workers: 1,
  retries: 1,
});
