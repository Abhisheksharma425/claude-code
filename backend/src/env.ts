import { config } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// An empty variable (e.g. `OPENAI_API_KEY=` exported by a shell) would block the value in .env, so treat it as unset.
for (const key of ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL', 'PORT']) {
  if (process.env[key]?.trim() === '') delete process.env[key]
}

// Load backend/.env first, then a .env in the repo root (values already set are not overwritten).
const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '..', '.env'), quiet: true })
config({ path: join(here, '..', '..', '.env'), quiet: true })
