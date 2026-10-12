import { defineConfig } from 'vitest/config';
export default defineConfig({ base: '/IPTVReader/', build: { target: 'es2022' }, test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
