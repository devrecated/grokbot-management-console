# grugbot-editor

grug want console do new thing. grug not want open editor. so grug make **editor bot** in Grok Bot. grug say what grug want. bot change app, build, commit, deploy. grug drink coffee.

this folder is template for that bot.

| File | What |
|---|---|
| [`bot-instructions.md`](bot-instructions.md) | paste into new bot as its instructions |
| [`examples/`](examples/) | built-out recipes bot (or human) can follow in about 5 minutes |

## Make the bot (one time)

1. in Grok Bot, make new bot. name it `grug editor` (any name fine). pick a picture of a rock.
2. paste all of [`bot-instructions.md`](bot-instructions.md) as its instructions.
3. replace the two placeholders at top of the instructions:
   - `<REPO_URL>`: your fork, like `https://github.com/OWNER/grokbot-management-console`
   - `<CHECKOUT_DIR>`: where bot keep its checkout on box, like `/workspace/grugbot-console-src`
4. give bot what it need, once, with Grok Bot secure secret request (never paste in chat):
   - GitHub access to push to your fork
   - `grugbot` CLI on box, already logged in (`grugbot init` done once, so `~/.config/grugbot/` exist)
5. say hi. bot ask first: **"what grug want console do?"**

## Ask it from the console

console Settings page have **Editor** card. type request, click send. it go through same webhook as chat, tagged `kind: "edit_request"`. dashboard inbox routine hand it to your editor bot. inbox routine never edit app itself.

no editor bot yet? inbox routine reply "make one from grugbot-editor/".

## What bot will and won't do

- will: edit code, keep it grug-simple, run `npm run build`, commit, push, `grugbot deploy --source <CHECKOUT_DIR>`, tell you the URL.
- will ask first before: new dependency, database change that drop or rewrite data, force-push, anything that send email or message to real people.
- won't: print or commit secrets, touch `.env` files, turn off Vercel Authentication.

## Recipes

| Recipe | What it add |
|---|---|
| [`examples/slack-discord-alerts.md`](examples/slack-discord-alerts.md) | failed runs post to Slack or Discord channel |
| [`examples/dashboard-widget.md`](examples/dashboard-widget.md) | new page plus a small widget on Routines page |
| [`examples/tailwind-shadcn.md`](examples/tailwind-shadcn.md) | swap plain CSS for Tailwind, add shadcn/ui pieces |
| [`examples/auth-multi-user.md`](examples/auth-multi-user.md) | real login, more than one user, per-user bots |

each recipe say: files to touch, code, how to test, how to deploy. copy pattern for your own idea.
