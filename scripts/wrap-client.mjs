import { readFile, writeFile } from 'node:fs/promises'

/**
 * Wrap the bundled browser half in the host's lazy module-table call.
 *
 * The web client does not import plugin bundles as ESM: it serves one script
 * per `dsh.client` package and that script must hand its factory to
 * `window.__ModuleLoader__.load`, whose `require` is the platform module table
 * (react, react/jsx-runtime, the client store engine).
 */
const CANDIDATES = ['.client-build/index.cjs', '.client-build/index.js']

const pkg = JSON.parse(await readFile('package.json', 'utf8'))

let body
for (const candidate of CANDIDATES) {
  try {
    body = await readFile(candidate, 'utf8')
  } catch {
    continue
  }
  break
}
if (body === undefined) {
  throw new Error(`wrap-client: no bundle at ${CANDIDATES.join(' or ')} — run the client build first`)
}

const wrapped = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`

await writeFile('lib/client.js', wrapped)
console.log(`wrapped ${pkg.name}/client -> lib/client.js (${wrapped.length} bytes)`)
