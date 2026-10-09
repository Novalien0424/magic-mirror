/** RAM-only source constraint from the visitor's words, never model tool arguments. */
export function localMediaOnly(text: string, previous = false): boolean {
  const value = text.normalize('NFKC').toLowerCase()
  const noYoutube = /(?:no|not|never|without|avoid|don't|do not)\s+(?:(?:use|search|play|on|from)\s+)*youtube|(?:不要|別|别|不用|禁止).{0,8}youtube/u.test(value)
  if (/youtube|youtu\.be/u.test(value) && !noYoutube) return false
  if (noYoutube || /\b(?:our|my|own|local)\s+(?:media\s+)?(?:folders?|vault|library|files?)\b|(?:我們|我们|我的|咱們|咱们).{0,4}(?:資料夾|资料夹|文件夾|文件夹|寶庫|宝库|媒體庫|媒体库)|(?:本機|本机|本地).{0,4}(?:音樂|音乐|媒體|媒体|資料夾|文件夹)/u.test(value)) return true
  return previous
}

/** Tool calls can precede final ASR; never broaden a source while it is unknown. */
export function createMediaSourcePolicy() {
  let localOnly = false, pending = false, item = '', explicitYoutube = false, localLookup = false
  const waiters = new Set<() => void>()
  const release = () => { for (const resolve of waiters) resolve() }
  return {
    begin(itemId: string) { if (item !== itemId) localLookup = false; item = itemId; pending = true; release() },
    observe(itemId: string, text: string) {
      if (item && item !== itemId) return
      localOnly = localMediaOnly(text, localOnly)
      if (localOnly) explicitYoutube = false
      else if (/youtube|youtu\.be/iu.test(text)) explicitYoutube = true
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
