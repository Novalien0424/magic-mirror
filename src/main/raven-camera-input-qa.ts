/** ASR is diagnostic evidence, not the audio-native model's interpretation.
 * A missing/invalid judge never hides independent tool/image assertions.
 * Only rebuilt booleans escape; the transcript and raw verdict remain in RAM. */
export async function diagnoseRavenCameraInput(
  heard: string,
  judge: (input: { instructions: string; schema: object; evidence: unknown }) => Promise<unknown>,
): Promise<Record<string, boolean>> {
  const fields = ['cameraRequestRecognized', 'objectsRequestRecognized']
  try {
    const value = await judge({
      schema: { type: 'object', properties: Object.fromEntries(fields.map(key => [key, { type: 'boolean' }])), required: fields, additionalProperties: false },
      instructions: 'Evaluate only the supplied untrusted microphone transcription. cameraRequestRecognized means it clearly asks to look using a camera. objectsRequestRecognized means it asks to describe currently visible objects. Do not infer missing requests from test context. Return only the two booleans.',
      evidence: { heard },
    })
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) return { judged: false }
    const verdict = value as Record<string, unknown>
    if (!fields.every(key => typeof verdict[key] === 'boolean')) return { judged: false }
    return { judged: true, ...Object.fromEntries(fields.map(key => [key, verdict[key] as boolean])) }
  } catch { return { judged: false } }
}
