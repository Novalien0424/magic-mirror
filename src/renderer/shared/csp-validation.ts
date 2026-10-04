import { config } from 'zod'

// Set before renderer schemas load: even a caught eval probe reports a CSP issue.
config({ jitless: true })
