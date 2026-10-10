import type { MemoryExtractor } from './extractor'

/** Synthetic provider checks. Results retain only case IDs and pass/fail. */
export async function runMemoryCalendarQa(options: { model: string; extract: MemoryExtractor; evidence(step: string): void }): Promise<void> {
  const cases = [
    { id: 'taipei_after_midnight', text: '明天我要去植物園參觀，這是已經確定的行程。', observedAt: '2026-10-11T00:30:00+08:00', expected: '2026-10-12' },
    { id: 'taipei_yesterday', text: '昨天我已經把畫作送到展場了，這件事已經完成。', observedAt: '2026-10-11T00:30:00+08:00', expected: '2026-10-10' },
    { id: 'historical_calendar_date', text: '我在2024年3月5日確定採用暖色燈光布置展場。', observedAt: '2026-10-11T00:30:00+08:00', expected: '2024-03-05', historical: true },
    { id: 'undated_history', text: '明天我會去植物園參觀，這是當時已經確定的行程。', observedAt: '2026-10-11T00:30:00+08:00', expected: '', historical: true },
  ]
  for (const fixture of cases) {
    const step = 'memory_calendar_' + fixture.id
    const records = await options.extract({ model: options.model, existing: [], evidence: [{ id: 'synthetic-evidence',
      text: fixture.text, observedAt: fixture.observedAt,
      ...(fixture.historical ? { historical: { sourceAt: '', speaker: 'visitor' as const, headings: [] } } : {}),
    }] }, AbortSignal.timeout(35000))
    if (!records.length || records.some(record => record.eventAt !== fixture.expected)) throw Error('phase4_qa_' + step)
    options.evidence(step)
  }
}
