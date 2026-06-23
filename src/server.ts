import http from 'node:http'
import path from 'node:path'

import { generateDomainArtifacts } from './generator.js'
import type {
  GenerateRequest,
  ListenerHeartbeat,
  ListenerServerOptions,
  ListenerStatus,
} from './types.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3210
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 15_000
const DEFAULT_RECONNECT_LOG_INTERVAL_MS = 5_000

interface MutableStatus extends ListenerStatus {
  activeTab: ListenerHeartbeat | null
}

function jsonResponse(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(payload)}\n`)
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const body = Buffer.concat(chunks).toString('utf8').trim()
  return body ? JSON.parse(body) as T : {} as T
}

function isHeartbeatFresh(status: MutableStatus, heartbeatTimeoutMs: number): boolean {
  if (!status.lastHeartbeatAt)
    return false
  return Date.now() - new Date(status.lastHeartbeatAt).getTime() <= heartbeatTimeoutMs
}

export async function startListenerServer(options: ListenerServerOptions = {}): Promise<http.Server> {
  const host = options.host ?? DEFAULT_HOST
  const port = options.port ?? DEFAULT_PORT
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS
  const reconnectLogIntervalMs = options.reconnectLogIntervalMs ?? DEFAULT_RECONNECT_LOG_INTERVAL_MS

  const status: MutableStatus = {
    connected: false,
    activeTab: null,
    generatedAt: null,
    outputRoot: null,
    lastHeartbeatAt: null,
  }

  let waitingLoggedAt = 0
  let lastConnectionLabel: string | null = null

  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET'
      const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`)

      if (method === 'OPTIONS') {
        jsonResponse(response, 204, { ok: true })
        return
      }

      if (method === 'GET' && requestUrl.pathname === '/health') {
        jsonResponse(response, 200, { ok: true })
        return
      }

      if (method === 'GET' && requestUrl.pathname === '/api/status') {
        status.connected = isHeartbeatFresh(status, heartbeatTimeoutMs)
        if (!status.connected) {
          status.activeTab = null
        }
        jsonResponse(response, 200, status)
        return
      }

      if (method === 'POST' && requestUrl.pathname === '/api/heartbeat') {
        const payload = await readJsonBody<ListenerHeartbeat>(request)
        const connectionLabel = `${payload.tabTitle}::${payload.tabUrl}`
        const wasConnected = status.connected
        status.connected = true
        status.activeTab = payload
        status.lastHeartbeatAt = new Date().toISOString()

        if (!wasConnected || lastConnectionLabel !== connectionLabel) {
          console.log(`[endge-codegen] Connected to tab "${payload.tabTitle}" (${payload.tabUrl})`)
        }

        lastConnectionLabel = connectionLabel
        jsonResponse(response, 200, { ok: true })
        return
      }

      if (method === 'POST' && requestUrl.pathname === '/api/generate') {
        const payload = await readJsonBody<GenerateRequest>(request)
        const outputDir = path.join(payload.outputRoot, 'src', 'gen')
        const result = await generateDomainArtifacts(payload.bundle, { outputDir })
        status.generatedAt = new Date().toISOString()
        status.outputRoot = payload.outputRoot

        console.log(`[endge-codegen] Generated files in ${result.outputDir}`)
        jsonResponse(response, 200, { ok: true, result })
        return
      }

      jsonResponse(response, 404, {
        ok: false,
        error: `Route not found: ${method} ${requestUrl.pathname}`,
      })
    }
    catch (error) {
      jsonResponse(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  console.log(`[endge-codegen] Listening on http://${host}:${port}`)
  console.log('[endge-codegen] Waiting for Chrome extension connection...')

  setInterval(() => {
    const fresh = isHeartbeatFresh(status, heartbeatTimeoutMs)
    if (fresh) {
      status.connected = true
      return
    }

    if (status.connected) {
      status.connected = false
      status.activeTab = null
      lastConnectionLabel = null
      console.log('[endge-codegen] Connection lost. Waiting for reconnection...')
      waitingLoggedAt = Date.now()
      return
    }

    if (Date.now() - waitingLoggedAt >= reconnectLogIntervalMs) {
      console.log('[endge-codegen] Connection not established yet. Retrying in 5 seconds...')
      waitingLoggedAt = Date.now()
    }
  }, reconnectLogIntervalMs)

  return server
}
