export interface EndgeDomainBundle {
  version: string
  exportedAt: string
  sourceUrl: string
  projectId: string | null
  environment: string | null
  domain: Record<string, unknown>
}

export interface ListenerHeartbeat {
  extensionVersion?: string
  tabId: number
  tabTitle: string
  tabUrl: string
  detectedAt: string
}

export interface ListenerStatus {
  connected: boolean
  activeTab: ListenerHeartbeat | null
  generatedAt: string | null
  outputRoot: string | null
  lastHeartbeatAt: string | null
}

export interface GenerateRequest {
  outputRoot: string
  bundle: EndgeDomainBundle
}

export interface GenerateResult {
  outputDir: string
  files: string[]
}

export interface ListenerServerOptions {
  host?: string
  port?: number
  heartbeatTimeoutMs?: number
  reconnectLogIntervalMs?: number
}
