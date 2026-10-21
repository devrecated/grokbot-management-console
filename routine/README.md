# Dashboard inbox routine

console have buttons and chat box. but console not do routine work itself. console send webhook to Grok Bot. this routine catch webhook and do work: pause, resume, pause all, resume all, new schedule, new trigger, new prompt, fetch prompt, answer chat. then it tell console "done" with `grugbox confirm` and `grugbox reply` (old `confirm.sh` and `reply.sh` still work, they just call grugbox).

prompt is in [`dashboard-inbox.prompt.md`](dashboard-inbox.prompt.md).

## Make it

1. box scripts installed first (see [Box setup](../README.md#box-setup)). prompt use `/workspace/grugbot-console`. you use other `INSTALL_DIR`? change paths in prompt to match.
2. in Grok Bot, make new routine. pick bot that live on same box.
3. trigger: **webhook**.
4. paste prompt from `dashboard-inbox.prompt.md`. replace `<YOUR_CONSOLE_URL>` with your console URL (the one `grugbot init` print).
5. save. Grok Bot show webhook URL and key. copy both.

## Tell console about webhook

console look for webhook in this order (`lib/webhook.js`):

1. database: `config` table, key `grokbot_webhook`, value `{"url": "...", "key": "..."}`.
2. Vercel env vars `GROKBOT_WEBHOOK_URL` and `GROKBOT_WEBHOOK_KEY`, only if database has nothing usable.

URL must start with `https://`. console send each payload as JSON POST with header `Authorization: Bearer <key>`.

`grugbot init` and `install.sh` not set webhook. you do it once, one of two ways.

database way (no redeploy). `config` table made on first page load, so open console once first:

```sql
insert into config(key, value, updated_at)
values ('grokbot_webhook', '{"url": "https://...", "key": "..."}'::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();
```

env way: add `GROKBOT_WEBHOOK_URL` and `GROKBOT_WEBHOOK_KEY` to Vercel project (production), then `grugbot deploy` so new values load.

## Check it

send chat message on console `/p/chat` page. note under box should say "Delivered to Grok Bot". says "webhook not configured"? console not find URL and key. says "webhook 401" or similar? key wrong.
