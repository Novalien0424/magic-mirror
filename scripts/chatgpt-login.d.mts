export const CHATGPT_ISSUER: string
export const CHATGPT_CLIENT_ID: string
export const CHATGPT_LOGIN_PORTS: readonly number[]
export const CHATGPT_LOGIN_SCOPE: string
export const CHATGPT_LOGIN_ORIGINATOR: string
export function claims(jwt: string): Record<string, unknown>
export function tokenFileText(tokens: { access_token: string; refresh_token: string; id_token: string }, now?: Date): string
export function writePrivate(path: string, text: string, options?: { waitMs?: number }): void
export function listen(server: import('node:http').Server, ports?: readonly number[]): Promise<number>
