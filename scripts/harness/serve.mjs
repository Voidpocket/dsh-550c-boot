/**
 * Tiny static server for the harness pages (verification scaffolding, not part of
 * the plugin). Rooted at the project directory so the pages can load
 * /lib/client.js — the real built bundle — over http.
 *
 * Usage: node scripts/harness/serve.mjs <port>
 * run.mjs starts one of these itself, so it is normally not run by hand.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const port = Number(process.argv[2] ?? 0)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  const target = join(root, normalize(pathname))
  if (!target.startsWith(root)) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const body = await readFile(target)
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' }).end(body)
  } catch (error) {
    res.writeHead(404).end('not found')
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`serving ${root} on http://127.0.0.1:${String(port)}\n`)
})
