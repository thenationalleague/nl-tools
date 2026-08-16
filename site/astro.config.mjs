import { defineConfig } from 'astro/config';

// Demo build: served by GitHub Pages from the repo's /site-demo/ directory
// at https://nl.tools/site-demo/. Source lives in /site/; `npm run build`
// outputs to dist/ (an outDir outside the project root breaks Node module
// resolution during route generation) and copies the result to ../site-demo.
export default defineConfig({
  site: 'https://nl.tools',
  base: '/site-demo',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover'
  },
  build: {
    format: 'directory'
  }
});
