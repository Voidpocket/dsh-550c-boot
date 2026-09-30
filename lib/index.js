/**
 * Host half of dsh-550c-boot.
 *
 * The animation itself is browser-side (lib/client.js). Its FIRST FRAME cannot
 * be: DSH's boot card ("HARNESS / Loading plugins…") is drawn by the shell
 * before any client plugin is materialised — measured on this machine, card at
 * 67 ms, this plugin's bundle evaluated at 338 ms, card disposed at 517 ms — so
 * a plugin that only paints from its own JS always leaves the card on screen
 * for a few hundred milliseconds, at any z-index.
 *
 * The one surface that exists earlier than the shell is the served document, and
 * DSH exposes it: `webserver/index-inject` collects a table of index rows, which
 * the Web carrier renders into index.html immediately after `<head>` and the
 * Desktop carrier applies page-side before it settles `__DSH_BOOT_READY__` —
 * both ahead of the shell kernel that builds the card. A `style` row plus one
 * synchronous `script` row is therefore on the glass while the document is still
 * parsing, and the card is never visible in the first place.
 *
 * Two contracts with src/client.js:
 *
 *   MODE_KEY   the same localStorage key and the same default; the script below
 *              bows out for 'off' so that setting still boots straight through
 *              to DSH with no black frame.
 *   FIRST_FRAME_GLOBAL
 *              `window.__dsh550cFirstFrame.end()` is how the splash retires the
 *              cover once its shadow root is on screen — same task, one paint,
 *              no seam. The boot watch and the timeout below are the fallbacks:
 *              a client bundle that fails to load must never leave a black
 *              window behind.
 *
 * @module dsh-550c-boot
 */

import { readFileSync } from 'node:fs'

export const name = 'boot-550c'

/** src/client.js MODE_KEY / DEFAULT_MODE — keep in sync. */
const MODE_KEY = 'dsh-550c-boot:mode'
/** src/client.js FIRST_FRAME_GLOBAL — keep in sync. */
const FIRST_FRAME_GLOBAL = '__dsh550cFirstFrame'
/** src/client.js VERSION_GLOBAL — the running version, for the settings row. */
const VERSION_GLOBAL = '__dsh550cVersion'
/** Painted under the splash's own --bg, so the handoff is invisible. */
const FIRST_FRAME_BG = '#050403'
/** Absolute ceiling (ms): past this the cover yields whatever is on the page. */
const FIRST_FRAME_MAX_MS = 12000
/** The splash's own :host z-index (src/client.js HOST_CSS) minus one. */
const FIRST_FRAME_Z = 2147482000

/**
 * Where the settings row's 检查更新 button gets its answer.
 *
 * The check runs HERE, not in the page: the served document's CSP is restrictive
 * and the host process already owns outbound network access, so one same-origin
 * route keeps the client free of cross-origin requests, CORS and CSP questions.
 * The route only ever reports what this package is and what GitHub publishes
 * about it — no user data, no credentials.
 */
const UPDATE_ROUTE = '/dsh-550c-boot/update'
const UPDATE_SOURCE = 'https://api.github.com/repos/yannicksong0106/dsh-550c-boot/releases/latest'
/** One upstream answer is reused for this long; the button is cheap to press. */
const UPDATE_TTL_MS = 10 * 60 * 1000
const UPDATE_TIMEOUT_MS = 6000

/**
 * The running version, read from the package that is actually installed.
 *
 * Reading package.json beats a build-time constant: a linked working tree (the
 * maintainer's own install) and a tarball both report the truth, and the version
 * can never drift from the manifest a release was cut from.
 */
function packageVersion() {
  try {
    const url = new URL('../package.json', import.meta.url)
    return JSON.parse(readFileSync(url, 'utf8')).version ?? null
  } catch (error) {
    return null
  }
}

const VERSION = packageVersion()

/**
 * Compare two semver-ish versions. Returns 1 when `a` is newer, -1 when `b` is,
 * 0 when they are equal. Build metadata is ignored; a prerelease ranks below its
 * own release (`0.2.0-rc.1 < 0.2.0`), which is what decides "an update is out".
 */
function compareVersions(a, b) {
  const parse = (value) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value ?? ''))
    return match === null ? null : { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
  }
  const left = parse(a)
  const right = parse(b)
  if (left === null || right === null) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] !== right.parts[index]) return left.parts[index] > right.parts[index] ? 1 : -1
  }
  if (left.pre === right.pre) return 0
  if (left.pre === null) return 1
  if (right.pre === null) return -1
  return left.pre > right.pre ? 1 : -1
}

/** The cached upstream answer, so repeated presses do not hammer the API. */
let cachedRelease = null
let cachedAt = 0

async function latestRelease() {
  if (cachedRelease !== null && Date.now() - cachedAt < UPDATE_TTL_MS) return cachedRelease
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS)
  try {
    const response = await fetch(UPDATE_SOURCE, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-550c-boot-update-check' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`github responded ${String(response.status)}`)
    const release = await response.json()
    cachedRelease = {
      tag: typeof release.tag_name === 'string' ? release.tag_name : null,
      url: typeof release.html_url === 'string' ? release.html_url : null,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    }
    cachedAt = Date.now()
    return cachedRelease
  } finally {
    clearTimeout(timer)
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/**
 * GET /dsh-550c-boot/update -> { current, latest, url, publishedAt, state }
 *
 * `state` is the whole answer the row needs: 'current' (nothing newer),
 * 'outdated', or 'unknown' when GitHub could not be reached — the row then offers
 * the release page instead of pretending to know.
 */
async function updateHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  let release = null
  let error = null
  try {
    release = await latestRelease()
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }
  const latest = release?.tag === null || release?.tag === undefined ? null : release.tag.replace(/^v/, '')
  const state =
    latest === null ? 'unknown' : VERSION === null ? 'unknown' : compareVersions(latest, VERSION) > 0 ? 'outdated' : 'current'
  sendJson(res, 200, {
    current: VERSION,
    latest,
    state,
    url: release?.url ?? null,
    publishedAt: release?.publishedAt ?? null,
    error,
  })
}

/**
 * The cover itself: the port's own background colour, above anything the page
 * paints and below the splash that replaces it. pointer-events stays off — the
 * card it covers is not interactive either.
 */
const FIRST_FRAME_CSS =
  'html.dsh550c-first::before{content:"";position:fixed;inset:0;background:' +
  FIRST_FRAME_BG +
  ';z-index:' +
  String(FIRST_FRAME_Z) +
  ';pointer-events:none}\n' +
  'html.dsh550c-first{background:' +
  FIRST_FRAME_BG +
  ';--dsw-specific-sidebar-fill:#141008;--dsw-alias-label-primary:#e8a020}'

/**
 * The class marker plus the handshake, the boot watch and the timeout.
 *
 * Deliberately tiny and synchronous: it runs while <head> is being parsed, so
 * the cover is applied before the first paint. The two DSH tokens it also sets
 * are the ones the Desktop preload measures into `setTitleBarOverlay` (see
 * src/client.js adaptCaption), which paints the OS caption strip black-and-amber
 * for the same window instead of leaving a grey Windows bar above a terminal.
 *
 * The cover must not outlive the reason for it, so a 250 ms watch ends it as
 * soon as the boot card is gone (the kernel removes the card exactly when the
 * application mounts) — or as soon as the card drops its spinner, which is how
 * the card renders its own failure state, since a broken page must be readable
 * rather than hidden. Nothing here is on the critical path: the splash retires
 * the cover itself, synchronously, the moment its shadow root is on screen.
 */
const FIRST_FRAME_SCRIPT =
  '(function(){' +
  'var mode=null;' +
  'try{mode=window.localStorage.getItem(' +
  JSON.stringify(MODE_KEY) +
  ')}catch(error){}' +
  'if(mode==="off")return;' +
  'var root=document.documentElement;' +
  'var watch=null;' +
  'var end=function(){' +
  'if(watch!==null){window.clearInterval(watch);watch=null}' +
  'root.classList.remove("dsh550c-first")' +
  '};' +
  'window.' +
  FIRST_FRAME_GLOBAL +
  '={end:end};' +
  'root.classList.add("dsh550c-first");' +
  'var seen=false;' +
  'watch=window.setInterval(function(){' +
  'var card=document.querySelector("[data-dsh-boot]");' +
  'if(card===null){if(seen)end();return}' +
  'seen=true;' +
  'if(card.querySelector("[data-dsh-boot-spinner]")===null)end()' +
  '},250);' +
  'window.setTimeout(end,' +
  String(FIRST_FRAME_MAX_MS) +
  ');' +
  '})()'

/**
 * Contribute the first frame to every index response.
 *
 * No service is injected: `webserver/index-inject` is a plain composition event
 * that the carrier emits per response, and a table is only rendered when a page
 * is actually served — so this costs one row and nothing when nobody asks.
 *
 * The update route is registered through an optional injection instead
 * (`ctx.inject(['webServer'], …)`), so a profile without an HTTP carrier — or one
 * that renames the service — still gets the splash; only the settings row loses
 * its button.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: FIRST_FRAME_CSS })
    table.push({ kind: 'script', placement: 'head', text: FIRST_FRAME_SCRIPT })
    // Ahead of the script rows: the settings row reads its own version from here
    // rather than asking the host for something it can already know.
    if (VERSION !== null) table.push({ kind: 'global', name: VERSION_GLOBAL, value: VERSION })
  })

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: UPDATE_ROUTE,
          handler: updateHandler,
        }),
      `boot-550c: GET ${UPDATE_ROUTE}`,
    )
  })
}
