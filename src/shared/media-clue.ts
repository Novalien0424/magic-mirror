import { Converter } from 'opencc-js/t2cn'
let script: ReturnType<typeof Converter> | undefined
/** Literal title index: script equivalents only, separate from pronunciation. */
export function mediaClueKey(value: string): string {
  return (script ??= Converter({ from: 't', to: 'cn' }))(value.normalize('NFKC')).toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim()
}
