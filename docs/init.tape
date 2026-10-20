# grugbot init, the whole flow, recorded against a fake Vercel API and a throwaway local Postgres.
# Nothing real is used: the token is fake_..., the database is a local test user.
#
#   cli/scripts/bundle.sh && (cd cli && go build -o /tmp/grugbot-demo/grugbot . && go build -o /tmp/grugbot-demo/fakevercel ./cmd/fakevercel)
#   vhs docs/init.tape
#
# Needs a local Postgres with user grug / password grugtest / database grug.

Output docs/init.gif

Require ffmpeg

Set Shell "bash"
Set FontSize 15
Set Width 1280
Set Height 800
Set TypingSpeed 40ms
Set Theme "Catppuccin Mocha"
Set Padding 16
Set BorderRadius 8
Set WindowBar Colorful
Set Framerate 30

Hide
Type "export PATH=/tmp/grugbot-demo:$PATH VERCEL_API_URL=http://127.0.0.1:8787 GRUGBOT_TEST_ORIGIN=http://127.0.0.1:8787 GRUGBOT_HOME=/tmp/grugbot-demo/home PS1='$ ' TERM=xterm-256color COLORTERM=truecolor; unset NO_COLOR VERCEL_TOKEN DATABASE_URL; rm -rf /tmp/grugbot-demo/home"
Enter
Type "(fakevercel >/dev/null 2>&1 &) ; sleep 1; clear"
Enter
Sleep 1.5s
Show

Type "grugbot init"
Sleep 400ms
Enter
Sleep 1.5s

# Vercel token (masked)
Type "fake_vercel_token_for_the_demo_only"
Sleep 300ms
Enter
Sleep 1.5s

# Team: pick the second one
Down
Sleep 500ms
Enter
Sleep 1s

# Project name: keep the default
Enter
Sleep 1s

# Database: own Postgres, paste a URL (masked)
Enter
Sleep 800ms
Enter
Sleep 800ms
Type "postgres://grug:grugtest@localhost:5432/grug?sslmode=disable"
Sleep 300ms
Enter

Sleep 9s

Hide
Type "pkill fakevercel"
Enter
