/**
 * Host-half tests: the update route handler, the version comparison, and the
 * wiring apply() performs. Pure node — no browser, no DSH — so CI always runs it.
 *
 * The handler is module-private on purpose (the plugin exposes one apply()), so the
 * test lifts it out of the built lib/index.js and drives it with fake req/res
 * objects. That keeps the risky part — method guard, upstream failure, the
 * current/outdated decision, the cache — covered without a running profile.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(here, '../lib/index.js')
const source = readFileSync(LIB, 'utf8')
const lift = (from, to, name) => {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)
  if (start < 0 || end < 0) throw new Error(`cannot lift ${name}`)
  // `import.meta` is not available inside new Function(); packageVersion() only
  // uses it to locate package.json, and the stub below does that itself.
  return source.slice(start, end).replaceAll('import.meta.url', 'globalThis.__metaUrl')
}

const factory = new Function(
  'fetch',
  'readFileSync',
  lift('const VERSION_GLOBAL', 'const FIRST_FRAME_CSS', 'helpers') +
    '; return { compareVersions: compareVersions, updateHandler: updateHandler, packageVersion: packageVersion }',
)

// packageVersion() hands readFileSync a URL object; node resolves it itself, so
// the stub has to do the same (fileURLToPath decodes the %-escaped path).
const readFileSyncStub = (path, encoding) =>
  readFileSync(path instanceof URL ? fileURLToPath(path) : String(path), encoding)

// packageVersion() builds `new URL('../package.json', <meta url>)`; the lifted
// code reads that meta url from globalThis because new Function() has no
// import.meta of its own.
globalThis.__metaUrl = import.meta.url

const load = (fetchImpl) => factory(fetchImpl, readFileSyncStub, import.meta.url)
const fakeResponse = () => {
  const out = { status: null, headers: null, body: null, ended: false }
  return {
    out,
    res: {
      writeHead(status, headers) {
        out.status = status
        out.headers = headers ?? null
      },
      end(body) {
        out.ended = true
        out.body = body ?? null
      },
    },
  }
}

const githubOk = (tag) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ tag_name: tag, html_url: `https://example.test/${tag}`, published_at: '2026-09-30T00:00:00Z' }),
})

let failures = 0
const check = (label, condition, detail) => {
  if (!condition) failures += 1
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : `  (${detail})`}`)
}

console.log('version comparison')
{
  const { compareVersions } = load(githubOk('v0.0.1'))
  for (const [a, b, want] of [
    ['0.2.0', '0.1.4', 1],
    ['0.1.4', '0.2.0', -1],
    ['0.1.4', '0.1.4', 0],
    ['v0.1.5', '0.1.4', 1],
    ['0.2.0-rc.1', '0.1.4', 1],
    ['0.1.4', '0.1.4-rc.1', 1],
    ['0.1.10', '0.1.9', 1],
    ['nonsense', '0.1.4', 0],
  ]) {
    check(`compare(${a}, ${b}) = ${String(want)}`, compareVersions(a, b) === want, `got ${String(compareVersions(a, b))}`)
  }
}

console.log('\npackage version')
{
  const { packageVersion } = load(githubOk('v0.0.1'))
  const version = packageVersion()
  check('reads the installed package.json', /^\d+\.\d+\.\d+/.test(String(version)), `got ${String(version)}`)
}

console.log('\nroute handler')
{
  const { updateHandler } = load(githubOk('v9.9.9'))
  const { out, res } = fakeResponse()
  await updateHandler({ method: 'POST' }, res)
  check('POST is refused with 405', out.status === 405 && out.ended === true, `status ${String(out.status)}`)

  const { updateHandler: handler2 } = load(githubOk('v9.9.9'))
  const probe = fakeResponse()
  await handler2({ method: 'GET' }, probe.res)
  const payload = JSON.parse(String(probe.out.body))
  check('GET answers 200 JSON', probe.out.status === 200 && probe.out.headers['content-type'].includes('json'))
  check('newer tag -> outdated', payload.state === 'outdated' && payload.latest === '9.9.9', JSON.stringify(payload))
  check('reports the running version', typeof payload.current === 'string' && payload.current.length > 0)
  check('passes the release url through', String(payload.url).includes('9.9.9'))
  check('no-store', probe.out.headers['cache-control'] === 'no-store')

  const { updateHandler: handler3 } = load(githubOk('v0.0.1'))
  const same = fakeResponse()
  await handler3({ method: 'GET' }, same.res)
  check('older tag -> current', JSON.parse(String(same.out.body)).state === 'current')

  const { updateHandler: handler4 } = load(async () => ({ ok: false, status: 503, json: async () => ({}) }))
  const failed = fakeResponse()
  await handler4({ method: 'GET' }, failed.res)
  const failedPayload = JSON.parse(String(failed.out.body))
  check('upstream failure -> unknown + error', failedPayload.state === 'unknown' && String(failedPayload.error).includes('503'))

  const { updateHandler: handler5 } = load(async () => {
    throw new Error('network down')
  })
  const thrown = fakeResponse()
  await handler5({ method: 'GET' }, thrown.res)
  check('thrown fetch -> unknown + error', JSON.parse(String(thrown.out.body)).state === 'unknown')

  // cache: one upstream call serves repeated presses
  let calls = 0
  const { updateHandler: handler6 } = load(async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({ tag_name: 'v9.9.9', html_url: 'u', published_at: 'p' }) }
  })
  await handler6({ method: 'GET' }, fakeResponse().res)
  await handler6({ method: 'GET' }, fakeResponse().res)
  check('second press reuses the cache', calls === 1, `upstream calls ${String(calls)}`)
}

console.log(failures === 0 ? '\nall route cases pass' : `\n${String(failures)} FAILURES`)

// ── the plugin's own wiring ────────────────────────────────────────────────
// apply() is the only exported behaviour, so drive it with a fake cordis context:
// what matters is that the index table gains the three rows (and the version
// global), and that the update route is registered with the right shape.
console.log('\nplugin wiring')
{
  const { apply } = await import(pathToFileURL(LIB).href)
  const events = new Map()
  const registrations = []
  const effects = []
  let injected = null
  const ctx = {
    on(name, handler) {
      events.set(name, handler)
      return () => {}
    },
    inject(deps, callback) {
      injected = deps
      callback({
        effect(fn, label) {
          effects.push(label)
          registrations.push(fn())
        },
        webServer: {
          register(route) {
            registrations.push(route)
            return () => {}
          },
        },
      })
    },
  }
  apply(ctx)

  const table = []
  const injectHandler = events.get('webserver/index-inject')
  check('listens to webserver/index-inject', typeof injectHandler === 'function')
  injectHandler(table)
  const kinds = table.map((row) => row.kind)
  check('injects style + script + global', JSON.stringify(kinds) === '["style","script","global"]', JSON.stringify(kinds))
  const global = table.find((row) => row.kind === 'global')
  check('global is __dsh550cVersion', global?.name === '__dsh550cVersion', String(global?.name))
  check('global carries a version', /^\d+\.\d+\.\d+/.test(String(global?.value)), String(global?.value))
  check('script row is head-placed', table.find((row) => row.kind === 'script')?.placement === 'head')
  check('cover css mentions the splash background', String(table[0].text).includes('#050403'))

  check('injects webServer optionally', JSON.stringify(injected) === '["webServer"]', JSON.stringify(injected))
  const route = registrations.find((item) => item !== null && typeof item === 'object' && 'path' in item)
  check('registers an exact route', route?.kind === 'exact' && route?.path === '/dsh-550c-boot/update', JSON.stringify(route?.path))
  check('route has a handler', typeof route?.handler === 'function')
  check('effect carries a label', effects.some((label) => String(label).includes('/dsh-550c-boot/update')), JSON.stringify(effects))
}

console.log(failures === 0 ? '\nall cases pass' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
