import type { KeepsakeSink } from './studio-runtime'

/** Future hardware adapter. Invoked only after the transfer cue; never archives. */
export function deferredPrinterSkill(report: (reason: string) => void): KeepsakeSink {
  return { name: 'printer', deliver: () => report('studio_printer_deferred') }
}
