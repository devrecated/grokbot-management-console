# grokbot-routines
Next.js dashboard for Grok Bot routine runs (Neon Postgres, Vercel Authentication).
- `/api/register`, `/api/runs`, `/api/messages`: bearer `ROUTINE_LOG_TOKEN` + `x-vercel-protection-bypass`.
- `/api/chat`: dashboard chat; forwards to `GROKBOT_WEBHOOK_URL` with `Authorization: Bearer $GROKBOT_WEBHOOK_KEY`.
- `box/`: shell helpers (log-run.sh, register.sh, reply.sh) that append locally and post to the API, using a `.env` like `box/env.example`.
Env: DATABASE_URL, ROUTINE_LOG_TOKEN, GROKBOT_WEBHOOK_URL, GROKBOT_WEBHOOK_KEY.
