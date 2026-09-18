// Runs smoke/page.html in headless Chrome over the DevTools protocol. Needs Chrome, takes no dependencies.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DEBUG_PORT = 9334
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`)
  process.exit(1)
}

const server = await (await createServer({ logLevel: 'error', server: { port: 5199 } })).listen()
const profile = mkdtempSync(join(tmpdir(), 'tinseltown-smoke-'))
const chrome = spawn(CHROME, ['--headless=new', '--enable-gpu', '--use-angle=metal', `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' })
let failed = true
// A wedged browser must not wedge CI or a terminal.
setTimeout(() => process.exit(1), 120_000).unref()

try {
  const url = `${server.resolvedUrls.local[0]}smoke/page.html`
  let target
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250)
    target = await fetch(`http://localhost:${DEBUG_PORT}/json/new?${url}`, { method: 'PUT' }).then(r => r.json()).catch(() => null)
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => (socket.onopen = resolve))

  const exceptions = []
  const pending = new Map()
  let nextId = 0
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description ?? 'exception')
    pending.get(message.id)?.(message.result)
  }
  const send = (method, params = {}) => new Promise(resolve => {
    pending.set(++nextId, resolve)
    socket.send(JSON.stringify({ id: nextId, method, params }))
  })
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value

  await send('Runtime.enable')
  await send('Page.reload')
  for (let i = 0; i < 240 && (await evaluate('document.title')) !== 'done'; i++) await sleep(250)

  const results = (await evaluate('window.smoke')) ?? [{ name: 'the page finished', ok: false }]
  for (const { name, ok, error } of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${error ? `: ${error}` : ''}`)
  for (const exception of exceptions) console.log(`FAIL uncaught: ${exception}`)
  failed = exceptions.length > 0 || results.some(result => !result.ok)
} finally {
  const exited = chrome.exitCode === null ? new Promise(resolve => chrome.once('exit', resolve)) : null
  chrome.kill()
  await Promise.all([exited, server.close()])
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
process.exit(failed ? 1 : 0)
