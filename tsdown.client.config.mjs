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
  // The host exposes exactly these ids to a plugin factory's `require`
  // (react, react/jsx-runtime, react-dom, react-dom/client, cordis, zod,
  // @tanstack/react-virtual and the dsh client packages). Anything else must be
  // bundled in: a `require` outside that table throws MODULE_NOT_FOUND while the
  // entry is imported, and the shell then reports "1 entry did not activate" and
  // fails the whole web boot. Bundling react-query / zustand / lucide-react was
  // the missing half of the legacy-page port.
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  // zustand's own entrypoints (`zustand/react`, `zustand/vanilla`) are what the
  // middleware re-imports, so match the package and every subpath, not one id.
  noExternal: ['@tanstack/react-query', 'lucide-react', /^zustand(\/|$)/],
  // The shell runs the bundle in a sandboxed renderer
  // (nodeIntegration: false, contextIsolation: true), so there is no `process`
  // global. Bundled react-query guards ~10 code paths with
  // `process.env.NODE_ENV !== "production"` — including the first line of
  // `useBaseQuery` — and a bare reference throws
  // "ReferenceError: process is not defined" the moment the page mounts. The
  // slot error boundary catches that, retires the entry, and the panel stays
  // blank without a console error. Fold the guard at build time.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
