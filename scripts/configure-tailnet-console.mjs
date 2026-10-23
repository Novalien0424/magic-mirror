import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import writeFileAtomic from 'write-file-atomic'

// Separate from the owner's existing :443 Funnel; never reset Serve config.
const status = JSON.parse(execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8' }))
if (status.BackendState !== 'Running') throw Error('tailscale_not_running')
const host = status.Self.DNSName.replace(/\.$/, '')
if (!/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(host)) throw Error('tailscale_dns_unavailable')
const before = JSON.parse(execFileSync('tailscale', ['serve', 'status', '--json'], { encoding: 'utf8' }))
if (before.AllowFunnel?.[`${host}:8443`]) throw Error('port_8443_has_public_funnel_disable_it_before_using_console')
const existing = before.Web?.[`${host}:8443`]
if (existing && existing.Handlers?.['/']?.Proxy !== 'http://127.0.0.1:38433') throw Error('port_8443_already_in_use')
execFileSync('tailscale', ['serve', '--bg', '--https=8443', 'http://127.0.0.1:38433'], { stdio: 'inherit' })
const after = JSON.parse(execFileSync('tailscale', ['serve', 'status', '--json'], { encoding: 'utf8' }))
if (after.AllowFunnel?.[`${host}:8443`] || JSON.stringify(after.Web?.[`${host}:443`]) !== JSON.stringify(before.Web?.[`${host}:443`])) throw Error('tailnet_console_serve_verification_failed')
const directory = join(homedir(), 'Library/Application Support/magic-mirror')
await mkdir(directory, { recursive: true })
const config = { origin: `https://${host}:8443`, port: 38433 }
await writeFileAtomic(join(directory, 'web-console.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
const saved = JSON.parse(await readFile(join(directory, 'web-console.json'), 'utf8'))
console.log(`Tailnet Console configured: ${saved.origin}/ (available while Magic Mirror is running)`)
