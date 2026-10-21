# Recipe: real login and more than one user

**goal:** let more people use one console, each seeing only their bots, without Vercel team seats.
**time:** about 5 minutes for login; per-user scoping a few more. **new deps:** `next-auth@5` (Auth.js). ask the user first.

today the console is single-user: Vercel Authentication guards everything, and box scripts use one bearer token. keep the bearer token for box routes. only swap the human login.

## 1. Auth.js with GitHub login

```bash
npm i next-auth@beta
```

GitHub → Settings → Developer settings → OAuth Apps → New. callback: `https://<your-console>/api/auth/callback/github`.
Vercel env vars (secrets, never commit): `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `ALLOWED_USERS` (comma list of GitHub logins).

`auth.js` (repo root):

```js
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
const allowed=(process.env.ALLOWED_USERS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers:[GitHub],
  callbacks:{ signIn:({profile})=>allowed.includes(String(profile?.login||"").toLowerCase()),
    session:({session,token})=>({...session,login:token.login}), jwt:({token,profile})=>(profile?{...token,login:profile.login}:token) },
});
```

`app/api/auth/[...nextauth]/route.js`:

```js
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

## 2. Guard pages, not box routes

`middleware.js`: keep the demo branch at top. then:

```js
import { auth } from "@/auth";
const BOX=["/api/register","/api/runs","/api/messages","/api/routines/confirm","/api/routines/prompt","/api/bots","/api/logs"];
export default auth(req=>{
  const p=req.nextUrl.pathname;
  if(p.startsWith("/api/auth")||BOX.some(b=>p===b&&req.method==="POST")) return; // bearer-checked in the route
  if(p==="/api/settings"&&req.method==="GET") return; // box reads intervals (it sends the bypass header today)
  if(!req.auth) return Response.redirect(new URL("/api/auth/signin",req.url));
});
```

then turn Vercel Authentication off for production only after login works on a preview URL.
keep `ROUTINE_LOG_TOKEN` checks in box routes as they are.

## 3. Per-user bots (optional)

`lib/db.js` `ensure`: `alter table routines add column if not exists owner text`.
`app/api/register/route.js`: accept `owner` from the box (set per bot in `register.sh` args or `.env`).
pages: `const s=await auth(); ... where owner=${s.login} or owner is null`. start with Routines and Usage pages.
Settings stay shared (one `config` row); per-user settings = key `settings:<login>` in `getSettings`.

## 4. Demo

demo keeps no login: in `middleware.js` the `DEMO` branch returns before `auth`. nothing to add to fixtures.

## 5. Test and ship

`npm run build`. on a preview deploy: sign in with an allowed login (works), a non-allowed one (refused), curl a box route with the bearer (still 200). update README Security section. commit, push, `grugbot deploy --source .`.
