/**
 * DSH's own index-injection row renderer, copied verbatim out of
 * @deepseek-ai/dsh-host-webserver/lib/index.js (app.asar, read-only). The
 * harness renders the real index.html through THIS code so the test exercises
 * the row vocabulary DSH actually implements, not a re-implementation of it.
 *
 * Source offsets in app.asar: 49733475 (rows) .. 49736900 (renderIndexInjections).
 */

/** Escape a row value before placing it in a quoted HTML attribute. */
function escapeHtmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
function assertNever(row) {
  throw new Error(`webserver: unknown index injection row ${JSON.stringify(row)}`)
}
/** Render one row to markup with its placement. */
function renderRow(row) {
  switch (row.kind) {
    case 'global':
      return {
        placement: 'head',
        markup: `<script>globalThis[${JSON.stringify(row.name).replaceAll('<', '\\u003c')}] = ${
          row.value === void 0 ? 'undefined' : JSON.stringify(row.value).replaceAll('<', '\\u003c')
        }<\/script>`,
      }
    case 'script':
      return { placement: row.placement, markup: `<script>${row.text}<\/script>` }
    case 'script-src':
      return { placement: row.placement, markup: `<script src="${escapeHtmlAttribute(row.src)}"><\/script>` }
    case 'script-preload':
      return { placement: 'head', markup: `<link rel="preload" as="script" href="${escapeHtmlAttribute(row.src)}">` }
    case 'style':
      return { placement: 'head', markup: `<style>${row.text}</style>` }
    case 'html':
      return { placement: row.placement, markup: row.html }
    default:
      return assertNever(row)
  }
}
/** Insert `markup` into `html` at `at`. */
function splice(html, at, markup) {
  return `${html.slice(0, at)}${markup}${html.slice(at)}`
}
const READY_MARKUP = '<script>(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()<\/script>'
/** Render rows into an index.html body: head rows after <head>, body rows after <body>. */
function renderIndexInjections(html, rows) {
  let head = ''
  let body = ''
  for (const row of rows) {
    const rendered = renderRow(row)
    if (rendered.placement === 'head') head += rendered.markup
    else body += rendered.markup
  }
  body += READY_MARKUP
  let out = html
  if (head !== '') {
    const open = /<head(?:\s[^>]*)?>/i.exec(out)
    out = open === null ? `${head}${out}` : splice(out, open.index + open[0].length, head)
  }
  if (body !== '') {
    const open = /<body(?:\s[^>]*)?>/i.exec(out)
    out = open === null ? `${out}${body}` : splice(out, open.index + open[0].length, body)
  }
  return out
}

export { renderIndexInjections, renderRow, READY_MARKUP }
