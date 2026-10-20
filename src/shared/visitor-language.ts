import { Converter } from 'opencc-js/t2cn'

let script: ReturnType<typeof Converter> | undefined
/** Conservative input-only hint: titles, names and short fragments leave the
 * current language alone. The model still receives the complete-sentence rule.
 * No visitor text is copied into the generated instruction or diagnostics.
 */
export function visitorSentenceLanguage(text: string): 'english' | 'chinese' | null {
  // Quoted names/titles are objects of the request, not its language. Unquoted
  // mixed input is classified from the leading clause, not any embedded title.
  const outer = text.replace(/《[^》]*》|「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"/gu, ' ').trim()
  if (!outer) return null
  const leading = outer.match(/[\p{Script=Han}A-Za-z]/u)?.[0] ?? ''
  if (/\p{Script=Han}/u.test(leading)) {
    const sentence = (script ??= Converter({ from: 't', to: 'cn' }))(outer)
    // Sentence structure, rather than Han count alone: a long song title or
    // person's name is still not a language-selection utterance.
    return /(?:我|你|我们|你们).{0,12}(?:想|要|有|会|能|觉得|喜欢)|(?:我|你|我们|你们)是.{1,}[。？！?!]$|(?:请|可以|能不能|帮我|告诉我).{1,}|(?:今天|昨天|明天).{2,}|现在.{0,6}几点|(?:这|那)是.{1,}|(?:为什么|怎么).{1,}|(?:你|我|他|她).{0,4}(?:吗|呢)[？！?！。\s]*$|^(?:播放|停止播放|唱|说说|解释).{0,}|^(?:只|仅)(?:在|从).{1,40}(?:找|搜|播)|(?:别|不要|不用).{0,12}(?:找|搜|播)/u.test(sentence) ? 'chinese' : null
  }
  const words = outer.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
  if (words.length < 3) return null
  return /\b(?:i|you|we|they|he|she|it|this|that)\s+(?:am|are|is|was|were|have|has|had|want|need|like|love|feel|think|miss|can|could|will|would|don't|do not|really|just)\b|\b(?:can|could|would|should|will|do|does|did|are|is)\s+(?:you|we|i|he|she|it|this|that)\b|\b(?:what|why|where|when|how|who)\s+(?:\w+\s+)?(?:is|are|was|were|do|does|did|can|could|would|should|will)\b|\bmy\s+name\s+is\b|\b(?:please\s+)?(?:play|tell|show|explain|remember|forget|stop|sing)\s+\w+|^(?:(?:please|only)\s+)?(?:try|look|search|find)\s+\w+|^(?:(?:the|a|an|my|our)\s+)?[a-z]+\s+(?:makes?|helps?|feels?|seems?|sounds?|looks?|stopped|started|changed|hurts?)\s+\w+/iu.test(outer) ? 'english' : null
}
