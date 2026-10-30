import source from '../../resources/config/prompts/dance-floor.v1.json' with { type: 'json' }
export function danceWelcomePrompt(avatar: { name: string; personality: string; speakingStyle: string }, language: 'zh-TW' | 'en'): string {
  const values = { ...avatar, language: language === 'en' ? 'English' : 'Taiwan Mandarin; Traditional Chinese script' }
  return source.welcome.replace(/\{\{(name|personality|speakingStyle|language)\}\}/g, (_, key: keyof typeof values) => values[key])
}
