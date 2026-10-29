import { defineConfig } from 'tsdown'

// Browser half builds to plain CJS first; scripts/wrap-client.mjs then wraps it
// in the host's module-table call (`window.__ModuleLoader__.load`). Keeping the
// two steps apart means the wrapper never has to fight the bundler's output.
export default defineConfig({
  entry: { index: 'src/client/index.ts' },
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: true,
  sourcemap: false,
  // Kept outside lib/ so the intermediate CJS never reaches the published package.
  outDir: '.client-build',
  fixedExtension: false,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
})
