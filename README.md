# GrugBot Console

grug have many bot. bots run routines. grug forget which bot do what, when, and did it work.

so grug make console. one page show all routines. grug see every run. grug pause routine, change schedule, change prompt. grug pause ALL routines with one button when cave on fire. grug chat with Grok Bot about routine. grug also see logs from box where bots live, how long box been awake, how hard box work, and how much bots been doing. grug get email when routine break.

**see demo first:** https://grugbot-console-demo.vercel.app

demo use fake bots and fake data. click all buttons. nothing break. nothing saved.

![Tour of the demo](docs/tour.gif)

app is Next.js on Vercel plus any Postgres. few small shell and Python scripts live on box and talk to app over HTTPS. that it. no kubernetes. no message queue. grug happy.

## Why grug keep it simple

grug not like complexity demon. so console run in minutes, for free.

- **Vercel account** (free, no card) deploy Next.js. click, done.
- need server anyway, so **Next.js**: pages and API in one place.
- need data store, so **Postgres**. where it live not matter. lazy grug use free **Neon** through Vercel: run few commands, click few buttons.
- UI is **plain CSS**. no design system to learn.
- core is small on purpose. build on it for any use case. too lazy? make [editor bot](grugbot-editor/) and ask it.

| Dependency | Why |
|---|---|
| Next.js | one app for pages and API routes; Vercel deploy it free |
| Postgres (`pg`) | boring, everywhere, free tiers; plain SQL, no ORM |
| TanStack Table + Virtual | Logs and Bots tables stay fast with 200k rows; headless, so still plain CSS |
| nodemailer | email alerts over any SMTP; only one path |
| Go CLI (`grugbot`) | one binary sets up Vercel, database, secrets; no Node needed for setup |

## Install grugbot

`grugbot` is small CLI. it set up console for you.

```bash
brew install OWNER/tap/grugbot        # macOS and Linux
winget install OWNER.grugbot          # Windows
```

## Quickstart

```bash
grugbot init
```

![grugbot init, start to finish](docs/init.gif)

`grugbot init` ask grug few things, then do boring work:

1. ask for Vercel token. token hidden when typed. token not saved. make one at https://vercel.com/account/tokens (Vercel have no device login for tools like this, so token it is).
2. ask which Vercel team.
3. ask where data live: your own Postgres, or free Neon database from Vercel Marketplace. own Postgres get tested right away: connect, then make and drop small table.
4. make Vercel project. set `DATABASE_URL` and new random `ROUTINE_LOG_TOKEN`.
5. turn on Vercel Authentication, so only your team see console. make bypass secret so box scripts still get in.
6. deploy. wait for ready. poke live URL to check login wall up and API alive.
7. write box secrets to `~/.config/grugbot/box.env` with mode 600. secrets never printed. grug not want secrets in terminal scrollback.

with Neon option, grugbot open Marketplace page in browser and wait until Neon put `DATABASE_URL` on project.

other commands:

| Command | What it do |
|---|---|
| `grugbot init` | first setup, like above |
| `grugbot doctor` | check config, file modes, database, project, env vars, protection, last deploy, live request |
| `grugbot deploy` | deploy app again, for example after `brew upgrade grugbot` |
| `grugbot uninstall` | delete Vercel project and local grugbot files. grug must type project name first. database not touched. |

every command take `--dry-run`. it print API calls and change nothing. for scripts, `--yes` skip questions and read `--team`, `--project`, `--db own|neon` and `--database-url` (or `DATABASE_URL`) from flags.

## Box setup

box is machine where bots run. four steps. do once.

**1. install box scripts**

```bash
git clone https://github.com/OWNER/grokbot-routines.git
mkdir -p /workspace/grugbot-console
# copy ~/.config/grugbot/box.env (from grugbot init) to /workspace/grugbot-console/.env
chmod 600 /workspace/grugbot-console/.env
INSTALL_DIR=/workspace/grugbot-console grokbot-routines/box/install.sh
```

what this do: copy scripts into `INSTALL_DIR`, start log loop. safe to run again (it is also how you update). setting missing? it print one line like `missing: VERCEL_BYPASS` and exit 3. never print secrets.

**2. make dashboard inbox routine**

follow [`routine/README.md`](routine/README.md): new Grok Bot routine, webhook trigger, paste [`routine/dashboard-inbox.prompt.md`](routine/dashboard-inbox.prompt.md).

what this do: routine catch console buttons and chat, do the routine work, report back.

**3. tell console the webhook**

put routine's webhook URL and key in database (no redeploy needed):

```sql
insert into config(key, value, updated_at)
values ('grokbot_webhook', '{"url": "https://...", "key": "..."}'::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();
```

or set Vercel env vars `GROKBOT_WEBHOOK_URL` + `GROKBOT_WEBHOOK_KEY` and run `grugbot deploy`. database wins if both set.

**4. check it work**

- top bar of console show box with green dot (pinged under 2 minutes ago).
- send message on `/chat`. note under it say "Delivered to Grok Bot".
- `grugbot doctor` say all good.

lazy way: tell your Grok Bot "set up GrugBot Console". it ask for secrets with secure secret request (never in chat) and do step 1.

<details>
<summary>email alerts (optional)</summary>

console can email grug when routine run fail (and on success, if grug want). one path: SMTP.

1. set Vercel env `SMTP_URL` (like `smtps://user:pass@smtp.example.com:465`) and `ALERT_FROM`, then `grugbot deploy`.
2. on `/settings`: tick "Email me when a routine run fails", type where to send.
3. edit subject and HTML if grug want. variables: `{{routine}}` `{{bot}}` `{{status}}` `{{time}}` `{{error}}` `{{link}}`. preview show right there. "Reset to default" bring back grug template.
4. click "Send test email".

no `SMTP_URL`? Settings say so in orange box, and nothing send. one run = one email max.

</details>

<details>
<summary>box agent reference (grugbox)</summary>

all box work is one small Rust program, `grugbox` (source in [`box/grugbox`](box/grugbox)). it collect logs, redact, ship, heartbeat, CPU/memory, bot activity, token estimates, Live stream. old `*.sh` names still work. each one is one line that call grugbox.

| Command | What it do |
|---|---|
| `install.sh` | install or update. copy prebuilt grugbox (or build it with cargo). keeps `.env`, `.token`, `logs/`, `runs.jsonl`, `registry.jsonl`, your edited `ship-config.json`. restart loop when grugbox change |
| `grugbox ensure-running` | start loop if dead. few milliseconds if alive. routines run it on wake, so loop survive reboot |
| `grugbox register bot bot_id routine_id name schedule_or_trigger purpose [active\|paused]` | add or update routine on console |
| `grugbox log-run bot routine_id ok\|error\|skipped summary [seconds]` | record one run. optional seconds feed run minutes on Usage page |
| `grugbox reply thread_id text` | Grok Bot reply into chat thread |
| `grugbox confirm routine_id ok\|fail ['{json}'] ['note']` | finish (or reject) pending change |
| `grugbox prompt routine_id prompt_file` | send routine prompt to console (answer to fetch) |
| `grugbox logs [-s source] [-l level] [-t 1h\|6h\|24h\|7d] [-g text] [-e regex] [-n 50]` | read logs from console server (box keep no copy) |
| `grugbox spool` | how many unsent batches wait on disk |
| `grugbox once` / `grugbox loop` | one pass / forever (loop is what ensure-running start) |
| `grugbox sample` / `grugbox os` | print one CPU/memory sample / OS facts (what heartbeat send) |
| `grugbox redact < file` | show what redaction do to some lines |
| `grugbox live <until>` | Live stream. loop start it for you when Box page say Live |

build it yourself:

```bash
cd box/grugbox
cargo build --release                      # target/release/grugbox
# static, like the committed box/grugbox/grugbox-x86_64-linux:
rustup target add x86_64-unknown-linux-musl && cargo build --release --target x86_64-unknown-linux-musl
```

four crates only: `regex`, `serde_json`, `flate2`, `sha2`. no SQLite, no C code. HTTP go through system `curl`, token in 0600 header file, never on command line. static musl binary about 1.7 MB.

`.env` keys: `ROUTINE_LOG_URL`, `ROUTINE_LOG_TOKEN`, `VERCEL_BYPASS`. how each bot register its routines: [`box/SETUP.md`](box/SETUP.md).

</details>

## Worker tasks

grug click button on dashboard, small job run on box. not shell. only jobs box already know.

- Tasks tab (`/p/worker-tasks`): pick task, fill args, confirm, run. output show up about every second. history under it.
- queue live in Postgres (`task_runs`, `task_output`). box not keep line open: grugbox pick up one queued run on its normal ship, so no extra database wake. wait is up to one ship/heartbeat interval.
- each run signed with HMAC-SHA256 using `TASK_KEY` (same value in box `.env` and dashboard env, never in database or browser). box check signature, expiry (10 min), nonce never seen before, task in its own allowlist (`tasks/<plugin>/tasks.json` next to grugbox), args match their type. any fail = run marked failed, nothing run.
- script run with `timeout` and `nice`, env wiped (no tokens), args as `TASK_ARG_*` env vars. output redacted like logs, 64 KB max.
- tasks: `restart-agent` (grugbox re-exec itself after reporting), `flush-spool`, `disk-usage`, `list-processes` (top 15 by CPU, names only), `tail-log` (allowlisted file, N lines).
- install.sh make `TASK_KEY` in box `.env` if missing (not printed). copy it into Vercel env as `TASK_KEY`, redeploy. no key = Tasks tab say so, nothing run.

### Add your own task

1. put script in `plugins/<plugin>/tasks/` (or `plugins/worker-tasks/tasks/`). read args from `$TASK_ARG_<NAME>`. `$GRUGBOX` is binary, `$GRUGBOX_DIR` its folder.
2. add it to that `tasks.json`:
   ```json
   {"name": "say-hi", "description": "Print hi N times.", "script": "say-hi.sh", "timeout_s": 10,
    "args": [{"name": "n", "type": "int", "min": 1, "max": 5, "default": 1}]}
   ```
   arg types: `int` (min, max), `enum` (options), `text` (pattern regex, max 200 chars). no free text without pattern.
3. run `box/install.sh` on box. box send new list on next ship; task show in Tasks tab.

## Make grug plugin

plugin = one folder. no framework.

```
plugins/<name>/
  plugin.json   {"name": "<name>", "title": "Tab title", "description": "...", "enabled": true, "provides": ["tasks","page","api"]}
  page.js       optional. server component, gets {q, searchParams, settings}. shows at /p/<name>, gets a tab.
  api.js        optional. export GET/POST/PUT(req, {q, path}) for /api/p/<name>/<path>;
                ensure(q) make tables; demo(q) seed demo mode; onShip(q, {iid, body}) ride on box ship and return extra reply fields.
  tasks/        optional. tasks.json + scripts, copied to box allowlist by install.sh.
  test/*.test.mjs   required. node:test file, app is running in demo mode at $BASE.
```

- `node plugins/load.mjs` (run by `npm run dev` and `npm run build`) read every `plugin.json` and write `plugins/index.gen.js`. commit it.
- Settings page list plugins with on/off. off = no tab, api answer 404, box get nothing from it.
- `npm run build && npm test` boot app in demo mode, run core tests and every plugin test. plugin with no test = test fail. CI (`.github/workflows/ci.yml`) do same on push and pull request.
- `plugins/worker-tasks` is example. copy it.

## Tokens (estimated from transcripts)

Grok Bot not tell box how many tokens it use. so grugbox guess, cheap way:

- it already read new transcript lines for bot activity. same bytes, no second read.
- each assistant line = one model call. input = system prompt size + conversation so far (capped at 200k tokens, because long chats get summarized). output = that line.
- bytes to tokens: 3.9 bytes per token. grug measured this against o200k tokenizer on 25 real transcripts (3.92). no tokenizer installed.
- ship only per-minute totals: bot, model, calls, input, output. no text leave box.
- prompt caching and hidden tool context not counted. treat as size, not bill.
- Usage page show tokens per bot and per routine (bot tokens during the run). cost only appear when you type your own price per 1M tokens per model in Settings. no price = no cost. grug not invent prices.
- cost: one extra add per line. measured: pass time same within noise (0.08 s for 2 MB of new transcript, with or without).

## Live

Box page has **Go live**. press it and box send CPU/memory every 2 s for 5 minutes, then stop by itself.

- button set `live_until` in database. box see it in reply to its next heartbeat or log ship (up to one interval), start `grugbox live`.
- live process send batch every 6 s, ask server each time "still live?". Stop button = it quit within 6 s.
- nothing run when nobody watch. page only poll while Live on and tab visible.
- measured: live process 0.16% of one core (with its curl calls), 2.3 MB memory.

## Database

any recent Postgres work (grug test Postgres 17 and PGlite). Neon, Supabase, RDS, box in closet. tables made on first request.

user need only this:

```sql
create user grugbot password '...';
grant connect on database grugbot to grugbot;
grant usage, create on schema public to grugbot;
```

| TLS setting | Effect |
|---|---|
| `sslmode=require` / `verify-full` / `disable` in URL | used as given |
| no `sslmode`, not localhost | TLS on, certificate checked |
| `DATABASE_SSL=no-verify` | TLS on, self-signed OK |
| `DATABASE_SSL=off` | TLS off |

## Demo mode

`DEMO_MODE=1`, no `DATABASE_URL`. app run on in-memory Postgres (PGlite) filled from `lib/demo-fixtures.js`. browser writes faked by `public/demo-shim.js` (gone when tab close). server answer every POST with fake "ok" (`middleware.js`). nothing saved, ever.

## How it work

```mermaid
flowchart LR
  subgraph Box["Bot machine (box)"]
    R[Routines] -->|register.sh / log-run.sh| API
    W[Inbox routine] -->|reply.sh / confirm.sh| API
    C[grugbox<br/>state.json + spool] -->|gzip batch via curl| API
  end
  subgraph Vercel["Vercel (Deployment Protection on)"]
    UI[Dashboard pages] --- API[API routes]
  end
  API <--> DB[(Postgres)]
  You((You)) -->|Vercel login| UI
  API -->|chat + actions| HOOK[Grok Bot webhook] --> W
```

life of a Pause click:

1. grug click Pause. console save pending change.
2. console send it to Grok Bot webhook.
3. inbox routine make change (or ask owner bot to).
4. routine run `confirm.sh`. pending clear, status update.
5. page notice. (page check every 5 s while something pending, every minute otherwise, never while tab hidden.)

**Pause all** same thing, but one webhook (`pause_all` or `resume_all`) carry list of every routine. inbox routine pause each one and run `confirm.sh` per routine. grug get confirm box first, so no oops.

| Page | What |
|---|---|
| `/bots` | bots and what they been doing |
| `/` | routines by bot, buttons (and Pause all / Resume all), run history |
| `/chat` | Grok Bot threads |
| `/logs` | box logs, filter by source, level, instance, time, text, regex |
| `/box` | one row per boot: start, last heartbeat, OS, which bots used box and when, CPU and memory sparklines |
| `/usage` | runs, run minutes, actions per bot then per routine, plus **estimate** from your own rates |
| `/settings` | Editor card (ask your editor bot for app changes), chat mirroring, time zone, ship and heartbeat interval, stale-box threshold, log retention, email alerts and templates, cost rates |

<details>
<summary>API reference</summary>

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/register` | bearer | add or update a routine |
| `POST /api/runs` | bearer | record a run (`ok`, `error`, `skipped`) |
| `POST /api/messages` | bearer | Grok Bot reply into a thread |
| `POST /api/routines/confirm` | bearer | apply or reject a pending change |
| `POST /api/routines/prompt` | bearer | owner bot sends a routine prompt (answer to `fetch_prompt`) |
| `POST /api/bots` | bearer | bot profiles and content-free activity |
| `POST /api/logs` | bearer | batch log ingest, JSON array, gzip allowed |
| `/api/chat`, `/api/actions`, `/api/settings`, `/api/alerts/test` | Vercel login | used by the dashboard |

bearer = `Authorization: Bearer $ROUTINE_LOG_TOKEN` plus `x-vercel-protection-bypass` header.

</details>

<details>
<summary>env vars</summary>

| Where | Name | What |
|---|---|---|
| Vercel | `DATABASE_URL` | Postgres connection |
| Vercel | `ROUTINE_LOG_TOKEN` | bearer token for box scripts |
| Vercel | `DATABASE_SSL` | optional: `no-verify` or `off` |
| Vercel | `DEMO_MODE` | `1` for demo, no database |
| Vercel | `GROKBOT_WEBHOOK_URL`, `GROKBOT_WEBHOOK_KEY` | fallback if `grokbot_webhook` not in `config` table |
| Vercel | `SMTP_URL` | optional: `smtps://user:pass@smtp.example.com:465` turn on email alerts |
| Vercel | `ALERT_FROM` | optional: from address for alerts |
| Vercel | `NEXT_PUBLIC_REPO_URL` | optional: your fork URL, used for demo "Get your own" and Settings editor docs link |
| box `.env` | `ROUTINE_LOG_URL`, `ROUTINE_LOG_TOKEN`, `VERCEL_BYPASS` | how box reach console |

</details>

<details>
<summary>manual setup (no grugbot)</summary>

1. make Vercel project from this repo. set `DATABASE_URL` (or add Neon from Vercel Marketplace).
2. turn on Vercel Authentication. make Protection Bypass for Automation secret.
3. set `ROUTINE_LOG_TOKEN` to long random string.
4. do Box setup above.

</details>

## What box send

grug not snoop. box send only this:

| Thing | What leave box | Kept on server |
|---|---|---|
| logs | new lines from allowed sources, redacted twice, gzipped | 7 days (Settings: 1 to 30), max 200,000 rows |
| bot activity | time, bot, event or tool name, target bot name. no commands, args, messages, results | 7 days, max 50,000 events |
| bot profiles | name, title, description, colour from `profile.json`. bot ids hashed | latest |
| heartbeat | hashed `machine_id` (stable) and `instance_id` (per boot), hostname, boot time, version. once per boot: distro, kernel, arch, cores, RAM | 30 days |
| box sample | with each heartbeat: CPU %, memory used/total, 1-min load, and grugbox own CPU, memory and pass time. no process names, no users, no files | 14 days |
| token estimate | per minute, per bot, per model: model calls, input and output token counts. numbers only, no text | 90 days |
| live sample | every 2 s, only while Live on: CPU %, memory | 15 minutes |
| prompts | only when you ask (Edit prompt) | in database, never in repo |

<details>
<summary>log details</summary>

- `grugbox` read new lines from `/var/log`, `/tmp`, tool caches, files running processes write, kernel log, journal, per-minute network summary, and send them. server (Postgres) is the only log store. box keep no log copy.
- box keep only `logs/state.json` (where it stopped reading each file, few kB) and `logs/spool/` (batches not sent yet because server down, gzip, max 4 MB, oldest dropped first). spool sent oldest first on next pass.
- old boxes: `install.sh` move read offsets out of old `logs/box-logs.db` once (and spool anything not shipped yet), so nothing ship twice. old db file stay, grug not delete it.
- never read: shell histories, `.env` and token files, agent transcript content.
- redaction catch things that look like token, password, key, JWT, URL with credentials. patterns miss some. check `ship-config.json` before allowing new source.
- `ship-config.json` hold allow/deny lists and `catalog` (feed Logs page (i) tooltip).
- loop run at lowest CPU and IO priority. it wake on faster of ship interval (15 s to 10 min) and heartbeat interval (30 s to 10 min), both default 1 min, both in Settings. box re-read settings at most every 5 min. lines only ship when ship interval due. nothing new = no request, just heartbeat.
- CPU sample is `/proc/stat` difference since last sample. no extra process, no sleep. only first 8 fields count (guest time already inside user time, old code count it twice on VMs). sample after long gap (loop stopped) is dropped, not shown as one big average.
- Box page: top card = current box (online dot, uptime, OS, grugbox own CPU/memory). then CPU % and memory % charts ([uPlot](https://github.com/leeoniya/uPlot), ~50 kB, the one chart lib here): hover show time + value, time axis in your Settings timezone, 6h/24h/7d/14d. line break only when no heartbeat for over 2x heartbeat interval. Live feed same charts. then small sessions table.
- session = one run of box: a boot, or a wake after VM was paused (Grok Bot box VM often get paused and resumed, not rebooted). grugbox spot wake (kernel boot time in `/proc/stat` jump forward by time asleep) and give wake fresh instance id: sha256(machine id, boot id, wake start). so no sleep hole inside a session; hole on chart = between sessions, or box loop stopped.
- Box page: pick 1h, 6h, 24h, 7d, 14d (window end now, real time axis) or from/to days, and one session or all. lines smoothed. Live show last hour and add raw 2 s points at right edge; old line not wiggle.
- grugbox also report itself: CPU (% of one core, includes the curl it run), peak memory, pass time. Box page show it in "Console agent" column.
- top bar dot: green under 2 heartbeats since ping, amber until stale threshold (Settings, default 10 min), grey after. click dot for Box page.

</details>

## Security

- every page and route behind Vercel Authentication. bot routes also need bearer token.
- secrets only in Vercel env vars, database `config` table, box `.env`. never in repo.
- scripts never print tokens. webhook errors hide key.
- `grugbox confirm` and `grugbox reply` fail loud on any non-2xx or redirect, so broken bypass secret not fail quiet.
- alert emails escape run text before it go in HTML. one email per run, never more (`runs.alerted_at`). demo never send email.

## Cost

free on Vercel plan you have plus free Postgres tier. about 43,000 small requests a month at default 1-minute ship interval. serverless database like Neon stay awake while box ship every minute; longer interval in Settings let it sleep. heartbeat count too: set both to 5 min if grug want sleepy database.

Usage page not know real price. Grok Bot not tell box tokens or bill. so page count runs, run minutes, and actions, then multiply by rates grug type in Settings. column say **estimate** because it is guess. check real bill with provider.

## Releasing

1. push `v*` tag.
2. GitHub Actions run GoReleaser: build `grugbot` for macOS, Linux, Windows (amd64 + arm64), bundle web app inside, write `checksums.txt`.
3. it make **draft** release. human press publish.

<details>
<summary>packaging and tests</summary>

- Homebrew: set `HOMEBREW_TAP_TOKEN` secret and GoReleaser push cask to `OWNER/homebrew-tap`. by-hand formula: `packaging/homebrew/grugbot.rb.tmpl`.
- winget: fill `packaging/winget/OWNER.grugbot.yaml` from `checksums.txt`, submit to `microsoft/winget-pkgs`.
- local build check: `goreleaser release --snapshot --clean`
- CLI tests: `cd cli && GRUGBOT_TEST_DB=postgres://... go test ./...` (runs `init` end to end against fake Vercel API and real Postgres)
- `docs/init.gif` made with [VHS](https://github.com/charmbracelet/vhs) from `docs/init.tape`, against fake Vercel API (`cli/cmd/fakevercel`). no real token, no real database.

</details>

## Philosophy

code follow [grug brain](https://grugbrain.dev) way: complexity very, very bad. plain React, plain CSS, no UI kit. one exception: Logs table use TanStack Table + Virtual, because thousands of rows worth not hand-rolling. nothing clever that tired grug can't read at 2 AM.

thank you grugbrain.dev. go read it. it short. it good.

## License

MIT
