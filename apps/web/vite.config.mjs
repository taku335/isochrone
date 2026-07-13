import { defineConfig } from 'vite';

const configuredBasePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: configuredBasePath.endsWith('/') ? configuredBasePath : `${configuredBasePath}/`,
});
