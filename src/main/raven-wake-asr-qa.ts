import { File } from 'decibri'
import { createEnvironmentCredentialSource } from './environment-credential-source'
import { normalizeTranscript } from './scenes/spell-trigger'
import { compileWakePhrase } from './wake/custom-keywords'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export function convertWakeQaPcmWithApple(pcm: Int16Array, inputRate: number): Int16Array {
  const converted = spawnSync('/usr/bin/swift', [join(process.cwd(), 'scripts/raven-qa-resample.swift'), String(inputRate), '16000'], {
    input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), timeout: 15000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'],
  })
  try {
    if (converted.status !== 0 || !converted.stdout.length || converted.stdout.length % 2) throw Error('raven_qa_apple_conversion_failed')
    return Int16Array.from({ length: converted.stdout.length / 2 }, (_, i) => converted.stdout.readInt16LE(i * 2))
  } finally { converted.stdout?.fill(0) }
}

/** QA-only conversion. Audio and recognized text never leave RAM locally. */
export async function convertWakeQaPcm(pcm: Int16Array, inputRate: number, sampleRate: number, conditioned = false): Promise<Int16Array> {
  const source = Float32Array.from(pcm, n => n / 32768), chunks: Buffer[] = []
  try {
    for await (const chunk of File.buffer(source, { inputRate, sampleRate, channels: 1, dtype: 'int16', vad: false,
      ...(conditioned ? { dcRemoval: true, highpass: 80 } : {}) })) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    try { return Int16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readInt16LE(i * 2)) }
    finally { bytes.fill(0) }
  } finally { source.fill(0); chunks.forEach(c => c.fill(0)) }
}

function compare(actual: string, expected: string, tokens: string) {
  const a = [...normalizeTranscript(actual)], b = [...normalizeTranscript(expected)]
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < b.length; j++) next.push(Math.min(row[j + 1]! + 1, next[j]! + 1, row[j]! + (a[i] === b[j] ? 0 : 1)))
    row = next
  }
  let pronunciationEquivalent: boolean | null = null, traditionalScriptEquivalent: boolean | null = null
  try { pronunciationEquivalent = compileWakePhrase(a.join(''), tokens) === compileWakePhrase(b.join(''), tokens) } catch { /* unsupported text is not inferred */ }
  const converted = spawnSync('/usr/bin/swift', [join(process.cwd(), 'scripts/raven-qa-transcription-comparison.swift')], {
    input: JSON.stringify([{ actual: a.join(''), expected: b.join('') }]), encoding: 'utf8', timeout: 15000, maxBuffer: 8192, stdio: ['pipe', 'pipe', 'ignore'],
  })
  try { if (converted.status === 0) traditionalScriptEquivalent = JSON.parse(converted.stdout)[0].traditionalScriptEquivalent === true } catch { /* metadata unavailable */ }
  return { exact: a.join('') === b.join(''), containsExpected: a.join('').includes(b.join('')),
    characters: a.length, expectedCharacters: b.length, editDistance: row[b.length], pronunciationEquivalent, traditionalScriptEquivalent }
}

/** Explicitly selected real-provider diagnostic, not a cloud wake fallback.
 * Main alone obtains credentials. Each sample gets fresh, unhinted ASR context. */
export async function compareWakeQaAsr(pcm: Int16Array, inputRate: number, model: string, expected: string,
  comparison: { tokens: string; cleanTranscript?: string; receive?: (text: string) => void }): Promise<Record<string, unknown>> {
  if (process.env['MIRROR_RAVEN_CONVERSATION_QA'] !== '1'
    || process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] !== 'wake_capture'
    || pcm.length > inputRate * 15) throw Error('raven_qa_asr_scope_invalid')
  const converted = await convertWakeQaPcm(pcm, inputRate, 24000)
  let socket: WebSocket | undefined, stage = 'credential'
  try {
    const credential = await createEnvironmentCredentialSource().get()
    if (!credential) throw Error()
    stage = 'client_secret'
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 60 }, session: { type: 'transcription',
        audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, noise_reduction: null,
          transcription: { model, languages: ['zh-tw'], delay: 'medium' }, turn_detection: null } } } }),
    })
    if (!response.ok) return { status: 'unavailable', stage, httpStatus: response.status }
    const body = await response.json() as { value?: string }
    if (typeof body.value !== 'string' || !body.value.startsWith('ek_')) throw Error()
    stage = 'socket'
    socket = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', ['realtime', 'openai-insecure-api-key.' + body.value])
    const ws = socket
    return await new Promise<Record<string, unknown>>(resolve => {
      let sent = false, finished = false
      const finish = (value: Record<string, unknown>) => { if (finished) return; finished = true; clearTimeout(timer); resolve(value) }
      const timer = setTimeout(() => finish({ status: 'unavailable', stage: 'transcript_timeout' }), 25000)
      ws.addEventListener('message', event => {
        if (finished || typeof event.data !== 'string' || event.data.length > 256 * 1024) return
        try {
          const e = JSON.parse(event.data)
          if (e.type === 'error') { finish({ status: 'unavailable', stage: 'provider_error' }); return }
          if (!sent && ['session.created', 'session.updated', 'transcription_session.created'].includes(e.type)) {
            const acknowledgedModel = e.session?.audio?.input?.transcription?.model ?? e.session?.input_audio_transcription?.model
            if (acknowledgedModel !== model) { finish({ status: 'unavailable', stage: 'session_model_mismatch' }); return }
            sent = true
            for (let at = 0; at < converted.length; at += 12000) {
              const part = converted.subarray(at, at + 12000)
              ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64') }))
            }
            ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
          }
          if (e.type === 'conversation.item.input_audio_transcription.completed' && typeof e.transcript === 'string') {
            comparison.receive?.(e.transcript)
            finish({ status: 'completed', ...compare(e.transcript, expected, comparison.tokens),
              ...(comparison.cleanTranscript !== undefined ? { agreesWithClean: compare(e.transcript, comparison.cleanTranscript, comparison.tokens) } : {}),
              model, acknowledgedModelMatches: true, hints: 'none', noiseReduction: 'none' })
          }
        } catch { finish({ status: 'unavailable', stage: 'event_invalid' }) }
      })
      ws.addEventListener('error', () => finish({ status: 'unavailable', stage: 'socket_error' }))
      ws.addEventListener('close', () => finish({ status: 'unavailable', stage: 'socket_closed' }))
    })
  } catch { return { status: 'unavailable', stage } }
  finally { socket?.close(); converted.fill(0) }
}
