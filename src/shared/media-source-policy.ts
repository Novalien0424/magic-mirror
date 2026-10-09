function sourceText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/’/gu, "'")
}

/** Mentioning a service or a title is not permission to broaden a local request. */
function requestsYoutube(value: string): boolean {
  return /\b(?:use|search|play|try|watch|check|loop|repeat)\s+(?:(?:on|from|for|the|a)\s+)*youtube\b/u.test(value)
    || /\b(?:play|search|find|watch|look|check|loop|repeat)\b[^.!?;。！？；]{0,160}\b(?:on|from|via)\s+youtube\b/u.test(value)
    || /^(?:on|from|via)\s+youtube\b|\byoutube\s*(?:,\s*)?(?:instead|please)\b|^youtube[\s.!?。！？]*$/u.test(value)
    || /(?:在|用|去|改到|改用|換成|换成|試試|试试|搜尋|搜索).{0,8}youtube\b/u.test(value)
    || /https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//u.test(value)
}

/** RAM-only source constraint from the visitor's words, never model tool arguments. */
export function localMediaOnly(text: string, previous = false): boolean {
  const value = sourceText(text)
  const noYoutube = /\b(?:no|not|never|without|avoid|don't|do not|instead of|rather than)\s+(?:(?:use|search|play|on|from|go|to|look|at|the)\s+)*(?:youtube|youtu\.be)\b|(?:不要|別|别|不用|禁止).{0,8}(?:youtube|youtu\.be)/u.test(value)
    || /\b(?:don't|do not|never|avoid)\s+(?:search|look|play|watch|check|use|go|try|loop|repeat)\b[^,.!?;，。！？；]{0,160}\b(?:on|from|via|to)\s+(?:youtube|youtu\.be)\b/u.test(value)
  if (requestsYoutube(value) && !noYoutube) return false
  if (noYoutube || /\b(?:our|my|own|local)\s+(?:(?:media|music|video)\s+)?(?:folders?|vault|library|files?)\b|\blocal\s+(?:music|videos?|media)\b|(?:我們|我们|我的|咱們|咱们).{0,4}(?:資料夾|资料夹|文件夾|文件夹|寶庫|宝库|媒體庫|媒体库)|(?:本機|本机|本地).{0,4}(?:音樂|音乐|媒體|媒体|資料夾|文件夹)/u.test(value)) return true
  return previous
}

/** Tool calls can precede final ASR; never broaden a source while it is unknown. */
export function createMediaSourcePolicy() {
  let localOnly = false, pending = false, item = '', explicitYoutube = false, localLookup = false
  const waiters = new Set<() => void>()
  const release = () => { for (const resolve of waiters) resolve() }
  return {
    begin(itemId: string) {
      if (item !== itemId) { localLookup = false; explicitYoutube = false }
      item = itemId; pending = true; release()
    },
    observe(itemId: string, text: string) {
      if (item && item !== itemId) return
      localOnly = localMediaOnly(text, localOnly)
      explicitYoutube = !localOnly && requestsYoutube(sourceText(text))
      pending = false; item = itemId; release()
    },
    searchedLocal() { localLookup = true },
    reset() { localOnly = false; pending = false; item = ''; explicitYoutube = false; localLookup = false; release() },
    async youtube(): Promise<'allowed' | 'restricted' | 'pending' | 'local_lookup_required'> {
      if (pending) await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); waiters.delete(done); resolve() }
        const timer = setTimeout(done, 1500); waiters.add(done)
      })
      return pending ? 'pending' : localOnly ? 'restricted' : explicitYoutube || localLookup ? 'allowed' : 'local_lookup_required'
    },
  }
}
