#!/usr/bin/env node
import { startListenerServer } from './server.js'

function readOption(name: string): string | null {
  const index = process.argv.findIndex(arg => arg === name)
  if (index === -1)
    return null
  return process.argv[index + 1] ?? null
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'listen'

  if (command !== 'listen') {
    console.error(`[endge-codegen] Unsupported command: ${command}`)
    process.exitCode = 1
    return
  }

  const portValue = readOption('--port')
  const parsedPort = portValue ? Number(portValue) : null
  const invalidPort = parsedPort !== null && (!Number.isInteger(parsedPort) || parsedPort <= 0)

  if (portValue && invalidPort) {
    console.error(`[endge-codegen] Invalid port: ${portValue}`)
    process.exitCode = 1
    return
  }

  await startListenerServer({ port: parsedPort ?? undefined })
}

void main()
