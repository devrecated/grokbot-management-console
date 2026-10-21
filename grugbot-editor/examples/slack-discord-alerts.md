# Recipe: Slack or Discord alert channel

**goal:** failed run post one message to Slack or Discord channel, next to (or instead of) email.
**time:** about 5 minutes. **new deps:** none (plain `fetch` to an incoming webhook).

## 1. Get a webhook URL

- Slack: api.slack.com/apps → your app → Incoming Webhooks → Add New Webhook to Workspace → pick channel → copy URL.
- Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.

store it as a Vercel env var (it is a secret): `ALERT_WEBHOOK_URL`. never commit it.

## 2. Settings: on/off switch

`lib/settings.js`, add to `DEFAULTS`:

```js
alert_chat:false,
```

`app/settings/form.js`, in the Email alerts card, after the success checkbox:

```jsx
<label className="srow"><input type="checkbox" checked={s.alert_chat} onChange={e=>set("alert_chat",e.target.checked)}/>
  <span><b>Also post failures to Slack/Discord</b><div className="muted">Needs ALERT_WEBHOOK_URL in the Vercel env.</div></span></label>
```

## 3. Send it

`lib/alerts.js`, add:

```js
// Slack and Discord both accept a JSON POST; Slack reads "text", Discord reads "content".
export async function postChat(text){
  const url=process.env.ALERT_WEBHOOK_URL; if(!url||DEMO) return {sent:false};
  try{ const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify(url.includes("discord")?{content:text}:{text}),signal:AbortSignal.timeout(8000)});
    return {sent:r.ok}; }catch{ return {sent:false}; }
}
```

in `alertRun`, after the email `send(...)` line (it already runs once per run because of `alerted_at`):

```js
if(s.alert_chat&&kind==="fail") await postChat(`🪨 ${vars.routine} (${vars.bot}) failed at ${vars.time}: ${vars.error}\n${vars.link}`);
```

note: `alertRun` returns early when email is off. if grug want chat-only, change the first line to
`if(!(s.alert_emails&&s.alert_to&&provider())&&!s.alert_chat) return null;` and guard the email `send` with the old condition.

## 4. Test

```bash
# local Postgres + a fake webhook catcher
python3 -c "import http.server as h;h.HTTPServer(('127.0.0.1',9099),type('H',(h.BaseHTTPRequestHandler,),{'do_POST':lambda s:(print(s.rfile.read(int(s.headers['content-length']))),s.send_response(200),s.end_headers())})).serve_forever()" &
ALERT_WEBHOOK_URL=http://127.0.0.1:9099/x DATABASE_URL=postgres://... ROUTINE_LOG_TOKEN=t npm run build && npx next start -p 3100 &
curl -s localhost:3100/api/settings -H 'content-type: application/json' -d '{"alert_chat":true}'
curl -s localhost:3100/api/runs -H 'content-type: application/json' -H 'authorization: Bearer t' \
  -d '{"bot":"bot-a","routine_id":"rt_x","status":"error","summary":"boom"}'
```

catcher print one JSON body. post same run again: nothing printed (dedupe).

## 5. Ship

README: add `ALERT_WEBHOOK_URL` row to env vars table. commit, push, `grugbot deploy --source .`, set the env var in Vercel, redeploy.
