import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { OperatorAction } from './operator-control'

type QaWindow = Pick<BrowserWindow, 'webContents' | 'getBounds' | 'isVisible' | 'isFocused' | 'isAlwaysOnTop' | 'isMinimized'>

/**
 * QA client of the production operator mailbox inside the process's own isolated
 * userData: the Stream Deck apps' and Remote Console's route, without the field
 * launcher, TV or mouse. Unknown or unreadable replies are 'invalid'.
 */
export async function sendQaOperatorCommand(userData: string, action: OperatorAction,
  timeoutMs = 15000): Promise<'success' | 'failed' | 'timeout' | 'invalid'> {
  const id = randomUUID(), directory = join(userData, 'operator-control')
  const request = join(directory, 'requests', `${id}.json`), temporary = `${request}.tmp`
  const response = join(directory, 'responses', `${id}.json`), issuedAt = Date.now()
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, id, action, issuedAt, expiresAt: issuedAt + 45000 }),
      { mode: 0o600, flag: 'wx' })
    await rename(temporary, request)
    const end = performance.now() + timeoutMs
    while (performance.now() < end) {
      let raw = ''
      try { raw = await readFile(response, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'invalid'
        await new Promise(done => setTimeout(done, 100))
        continue
      }
      const reply = JSON.parse(raw)
      if (reply.version !== 1 || reply.id !== id) return 'invalid'
      if (reply.status === 'success' && reply.reason === 'operator_control_complete') return 'success'
      return reply.status === 'failed' && reply.reason === 'operator_control_failed' ? 'failed' : 'invalid'
    }
    return 'timeout'
  } catch { return 'invalid' } finally {
    for (const path of [temporary, request, response]) await unlink(path).catch(() => undefined)
  }
}

export interface ConsolePlacement {
  readonly visible: boolean
  readonly minimized: boolean
  readonly focused: boolean
  readonly alwaysOnTop: boolean
  readonly onMirrorDisplay: boolean
  readonly insideWorkArea: boolean
  readonly mirrorVisible: boolean
  readonly mirrorAlwaysOnTop: boolean
  /** Visible app windows other than the mirror that overlap the mirror's display. */
  readonly windowsOverMirror: number
  readonly bounds: Electron.Rectangle
}

/** Where the one Console window is relative to the mirror, from Electron's own window state. */
export function consolePlacement(console: QaWindow, mirror: QaWindow): ConsolePlacement {
  const bounds = console.getBounds(), display = screen.getDisplayMatching(bounds)
  const mirrorDisplay = screen.getDisplayMatching(mirror.getBounds()), area = display.workArea, glass = mirrorDisplay.bounds
  const overlaps = (r: Electron.Rectangle): boolean => r.x < glass.x + glass.width && glass.x < r.x + r.width
    && r.y < glass.y + glass.height && glass.y < r.y + r.height
  return {
    visible: console.isVisible(), minimized: console.isMinimized(), focused: console.isFocused(),
    alwaysOnTop: console.isAlwaysOnTop(), onMirrorDisplay: display.id === mirrorDisplay.id,
    insideWorkArea: bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width
      && bounds.y + bounds.height <= area.y + area.height,
    mirrorVisible: mirror.isVisible(), mirrorAlwaysOnTop: mirror.isAlwaysOnTop(),
    windowsOverMirror: BrowserWindow.getAllWindows().filter(win => !win.isDestroyed() && win.isVisible()
      && win.webContents !== mirror.webContents && overlaps(win.getBounds())).length,
    bounds,
  }
}

/** Remote Console: in front on another display at the normal level, the avatar uncovered. */
export function besideMirror(p: ConsolePlacement): boolean {
  return p.visible && !p.minimized && p.focused && !p.alwaysOnTop && !p.onMirrorDisplay && p.insideWorkArea
    && p.mirrorVisible && p.mirrorAlwaysOnTop && p.windowsOverMirror === 0
}

/** CONSOLE key: visible, focused and always on top over the mirror, inside its work area. */
export function overMirror(p: ConsolePlacement): boolean {
  return p.visible && !p.minimized && p.focused && p.alwaysOnTop && p.onMirrorDisplay && p.insideWorkArea
    && p.mirrorVisible && p.windowsOverMirror === 1
}
