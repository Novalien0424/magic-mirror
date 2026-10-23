/** The browser Console uses the same Main-owned, opaque media asset resolver. */
export const isWebConsole = () => typeof document !== 'undefined' && document.documentElement.dataset.webConsole === 'true'
export const mediaUrl = (url: string): string => isWebConsole()
  && url.startsWith('magic-mirror-media://') ? `${location.origin}/media/${url.slice('magic-mirror-media://'.length)}` : url
