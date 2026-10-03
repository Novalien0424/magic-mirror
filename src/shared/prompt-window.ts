import { PROMPT_TABS } from './prompt-inspection'
export const promptWindowName = (index: number): string => `mirror-prompt-${index}`
export function allowPromptWindow(kind: string, url: string, frameName: string): boolean {
  return kind === 'console' && url === 'about:blank'
    && PROMPT_TABS.some((_tab, index) => frameName === promptWindowName(index))
}
