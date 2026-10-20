import { z } from 'zod'

/** Numerical native decoder data only; never recognized tokens or audio. */
export const wakeScoreSchema = z.object({
  acousticScore: z.number().min(0).max(1),
  matchedTokens: z.number().int().min(0).max(1024),
  totalTokens: z.number().int().min(1).max(1024),
  trailingBlanks: z.number().int().nonnegative(),
  decodedSteps: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(value => value.matchedTokens <= value.totalTokens)

export type WakeScore = z.infer<typeof wakeScoreSchema>
