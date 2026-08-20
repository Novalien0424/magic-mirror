import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'configure-windows-electron-firewall.ps1')
const ELECTRON_PATH = /node_modules[\\/]electron[\\/]dist[\\/]electron\.exe/i

const RULE_NAMES = {
  tcp: 'MagicMirror.Development.Electron.TCP',
  udp: 'MagicMirror.Development.Electron.UDP',
} as const

function readFirewallScript(): string {
  expect(existsSync(SCRIPT_PATH), `missing required contract file: ${SCRIPT_PATH}`).toBe(true)
  return readFileSync(SCRIPT_PATH, 'utf8').replace(/\r\n?/g, '\n')
}

function quotedLiteral(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`["']${escaped}["']`, 'i')
}

function protocolContext(source: string, protocol: string): string {
  const match = new RegExp(
    `(?:-Protocol\\s+["']?${protocol}["']?|\\bProtocol\\s*=\\s*["']?${protocol}["']?)`,
    'i',
  ).exec(source)
  expect(match, `missing literal ${protocol} protocol rule`).not.toBeNull()

  const index = match?.index ?? -1
  expect(index, `missing source position for ${protocol} protocol rule`).toBeGreaterThanOrEqual(0)
  return source.slice(Math.max(0, index - 900), Math.min(source.length, index + 900))
}

function programVariable(context: string, protocol: string): string {
  const match = /(?:-Program\s+|\bProgram\s*=\s*)(\$[A-Za-z_][A-Za-z0-9_]*)/i.exec(context)
  expect(match, `${protocol} rule is not scoped to a program variable`).not.toBeNull()
  return match?.[1] ?? ''
}

function removeBranch(source: string): string {
  const startMatch = /\bif\s*\(\s*\$Remove(?:\.IsPresent)?\s*\)/i.exec(source)
  expect(startMatch, 'missing explicit -Remove branch').not.toBeNull()

  const start = startMatch?.index ?? -1
  expect(start, 'missing -Remove branch source position').toBeGreaterThanOrEqual(0)
  const branchSource = source.slice(start)
  const exitMatch = /\b(?:return|exit)\b/i.exec(branchSource)
  expect(exitMatch, '-Remove branch must stop before installation').not.toBeNull()
  return branchSource.slice(0, (exitMatch?.index ?? branchSource.length) + (exitMatch?.[0].length ?? 0))
}

describe('Windows Electron development firewall static contract', () => {
  it('defines deterministic private inbound TCP and UDP rules with safe elevation and WhatIf support', () => {
    const source = readFirewallScript()

    expect(source).toMatch(/\[CmdletBinding\b/i)
    expect(source).toMatch(/SupportsShouldProcess\s*=\s*\$true/i)
    expect(source).toMatch(/\$PSCmdlet\s*\.\s*ShouldProcess\s*\(/i)

    expect(source).toMatch(/\$PSScriptRoot\b/i)
    expect(source).toMatch(/\$PSScriptRoot[\s\S]{0,500}node_modules[\\/]electron[\\/]dist[\\/]electron\.exe/i)
    expect(source).toMatch(/\b(?:Join-Path|Resolve-Path|GetFullPath)\b/i)
    expect(source).toMatch(/\$env:OS\b|\$IsWindows\b|Windows_NT/i)

    for (const protocol of ['tcp', 'udp'] as const) {
      const context = protocolContext(source, protocol.toUpperCase())
      const variable = programVariable(context, protocol.toUpperCase())

      expect(context).toMatch(/\bNew-NetFirewallRule\b/i)
      expect(context).toMatch(quotedLiteral(RULE_NAMES[protocol]))
      expect(context).toMatch(new RegExp(
        `\\bNew-NetFirewallRule\\b[\\s\\S]{0,500}-DisplayName\\s+${quotedLiteral(RULE_NAMES[protocol]).source}`,
        'i',
      ))
      expect(context).toMatch(/(?:-Direction\s+["']?Inbound["']?|\bDirection\s*=\s*["']?Inbound["']?)/i)
      expect(context).toMatch(/(?:-Profile\s+["']?Private["']?|\bProfile\s*=\s*["']?Private["']?)/i)
      expect(context).toMatch(/(?:-Action\s+["']?Allow["']?|\bAction\s*=\s*["']?Allow["']?)/i)
      expect(context).toMatch(/(?:-Enabled\s+["']?(?:True|\$true)["']?|\bEnabled\s*=\s*["']?(?:True|\$true)["']?)/i)
      expect(context).toMatch(/(?:-EdgeTraversalPolicy\s+["']?Block["']?|\bEdgeTraversalPolicy\s*=\s*["']?Block["']?)/i)
      expect(context).toMatch(/(?:-PolicyStore\s+["']?PersistentStore["']?|\bPolicyStore\s*=\s*["']?PersistentStore["']?)/i)

      expect(source).toMatch(new RegExp(
        `${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*[\\s\\S]{0,500}${ELECTRON_PATH.source}`,
        'i',
      ))
    }

    const tcpContext = protocolContext(source, 'TCP')
    const udpContext = protocolContext(source, 'UDP')
    const tcpProgram = programVariable(tcpContext, 'TCP')
    const udpProgram = programVariable(udpContext, 'UDP')
    expect(udpProgram.toLowerCase()).toBe(tcpProgram.toLowerCase())

    expect(source).toMatch(/WindowsPrincipal/i)
    expect(source).toMatch(/WindowsIdentity\s*::\s*GetCurrent\s*\(/i)
    expect(source).toMatch(/IsInRole\s*\([\s\S]{0,160}WindowsBuiltInRole\s*::\s*Administrator/i)
    expect(source).toMatch(/Start-Process[\s\S]{0,320}-Verb\s+RunAs/i)
    expect(source).toMatch(/Start-Process[\s\S]{0,320}\$PSCommandPath/i)

    expect(source).toMatch(/\bGet-NetFirewallRule\b[\s\S]{0,260}-Name\b/i)
    expect(source).toMatch(/\bGet-NetFirewallRule\b[\s\S]{0,320}-ErrorAction\s+(?:SilentlyContinue|Ignore)/i)
    expect(source).toMatch(/\bRemove-NetFirewallRule\b[\s\S]{0,260}-Name\b/i)
    expect(source).toMatch(/\bNew-NetFirewallRule\b/i)
    expect(source).toMatch(/\bGet-NetFirewallRule\b[\s\S]{0,700}\bRemove-NetFirewallRule\b[\s\S]{0,1400}\bNew-NetFirewallRule\b/i)

    expect(source).toMatch(quotedLiteral(RULE_NAMES.tcp))
    expect(source).toMatch(quotedLiteral(RULE_NAMES.udp))
  })

  it('supports deterministic removal and rejects firewall-wide or broad rule patterns', () => {
    const source = readFirewallScript()
    const branch = removeBranch(source)

    expect(source).toMatch(/\[switch\]\s*\$Remove\b/i)
    expect(branch).toMatch(/\bRemove-NetFirewallRule\b[\s\S]{0,260}-Name\b/i)
    expect(branch).not.toMatch(/(?:-DisplayGroup|-Program|-Direction|-Profile|-Action|-Protocol|-Remote)/i)
    expect(branch).not.toMatch(/\bNew-NetFirewallRule\b/i)
    expect(source).toMatch(quotedLiteral(RULE_NAMES.tcp))
    expect(source).toMatch(quotedLiteral(RULE_NAMES.udp))

    const forbiddenPatterns = [
      /\b(?:Disable-NetFirewallProfile|Set-NetFirewallProfile|Set-NetFirewallSetting|Set-NetFirewallRule)\b/i,
      /\bnetsh(?:\.exe)?\b/i,
      /(?:-Profile\b|\bProfile\s*=\s*)["']?(?:Public|Any)\b/i,
      /(?:-Program\b|\bProgram\s*=\s*)[^\n]{0,160}[*?]/i,
      /(?:-Program\b|\bProgram\s*=\s*)\s*["']?(?:\$null|Any)["']?/i,
      /(?:-Direction\b|\bDirection\s*=\s*)["']?Outbound\b/i,
      /(?:-Remote(?:Address|Port)\b|\bRemote(?:Address|Port)\s*=\s*)[^\n]{0,100}(?:\bAny\b|\*)/i,
      /\b(?:DefaultInboundAction|DefaultOutboundAction)\b/i,
    ]

    for (const forbidden of forbiddenPatterns) expect(source).not.toMatch(forbidden)
  })
})
