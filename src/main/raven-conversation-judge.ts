import { createEnvironmentCredentialSource } from './environment-credential-source'

/** Main-only, configured Responses model. Generated dialogue is transmitted for
 * this authorized QA judgment but never logged, archived, or stored by Responses. */
export async function judgeRavenConversation(input: { model: string; instructions: string; schema: object; evidence: unknown; image?: string }): Promise<unknown> {
  try {
    if (input.image !== undefined && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image) || input.image.length > 3_000_000)) throw Error()
    const credential = await createEnvironmentCredentialSource().get()
    if (!credential) throw Error()
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.model, store: false, instructions: input.instructions,
        input: input.image ? [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(input.evidence) },
          { type: 'input_image', image_url: input.image, detail: 'auto' }] }] : JSON.stringify(input.evidence),
        text: { format: { type: 'json_schema', name: 'raven_quality', strict: true, schema: input.schema } } }),
    })
    if (!response.ok || !response.body) throw Error()
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.length
        if (bytes > 256 * 1024) { await reader.cancel(); throw Error() }
        chunks.push(part.value)
      }
    } finally { reader.releaseLock() }
    const result = JSON.parse(Buffer.concat(chunks).toString())
    if (result.status !== 'completed' || !Array.isArray(result.output)) throw Error()
    const text = result.output.filter((item: { type: string; phase?: unknown }) => item.type === 'message' && (item.phase == null || item.phase === 'final_answer'))
      .flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
    if (text.length !== 1 || text[0].type !== 'output_text') throw Error()
    return JSON.parse(text[0].text)
  } catch { throw Error('raven_qa_judge_unavailable') }
}
