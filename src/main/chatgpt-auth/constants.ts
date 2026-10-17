/** Public Codex OAuth client facts; mirrored by scripts/chatgpt-login.mjs (parity-tested). */
export const CHATGPT_ISSUER = 'https://auth.openai.com'
export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CHATGPT_TOKEN_FILE = '.env.chatgpt'
/** Codex refreshes after this many days even when the access token is still valid. */
export const CHATGPT_REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000
export const CHATGPT_EXPIRY_MARGIN_MS = 5 * 60 * 1000
