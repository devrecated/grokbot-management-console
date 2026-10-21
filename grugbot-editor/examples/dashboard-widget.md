# Recipe: custom page and a dashboard widget

**goal:** new `/health` page showing success rate per routine for last 7 days, plus a small "today" widget at top of Routines page.
**time:** about 5 minutes. **new deps:** none.

## 1. The query (one place)

`lib/health.js`:

```js
// Success rate per routine. One cheap grouped query; runs table is small.
export async function health(q,days=7){
  return q`select r.routine_id, coalesce(max(rt.name),r.routine_id) name, r.bot,
    count(*)::int n, count(*) filter (where r.status='ok')::int ok, max(r.ts) last_at
    from runs r left join routines rt using(routine_id)
    where r.ts > now() - make_interval(days => ${days}) group by r.routine_id, r.bot order by ok::float/count(*) asc`;
}
```

## 2. The page

`app/health/page.js` (server component, no client JS):

```jsx
import { sql, ensure } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { health } from "@/lib/health";
import Nav from "../nav";
export const dynamic="force-dynamic";
export default async function Health(){
  const q=sql(); await ensure(q); const tz=(await getSettings(q)).timezone; const rows=await health(q);
  const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  return <><Nav active="health"/><main><h2>Health, last 7 days</h2><table>
    <thead><tr><th>Routine</th><th>Bot</th><th>Success</th><th>Runs</th><th>Last run</th></tr></thead>
    <tbody>{rows.map(r=>{ const pct=Math.round(100*r.ok/r.n); return <tr key={r.routine_id}>
      <td>{r.name}</td><td>{r.bot}</td>
      <td><span className="bar"><span style={{width:pct+"%",background:pct>90?"#1e8e3e":pct>70?"#f9ab00":"#c5221f"}}/></span> {pct}%</td>
      <td>{r.n}</td><td>{fmt(r.last_at)}</td></tr>; })}</tbody></table></main></>;
}
```

`app/globals.css`:

```css
.bar{display:inline-block;width:80px;height:8px;background:#eef0f3;border-radius:4px;vertical-align:middle;overflow:hidden}
.bar span{display:block;height:100%}
```

`app/nav.js`: add `["health","Health","/health"]` to `TABS`.

## 3. The widget

`app/today.js`:

```jsx
// Tiny server widget: today's runs, failures, and the worst routine.
import { health } from "@/lib/health";
export default async function Today({q}){
  const [t]=await q`select count(*)::int n, count(*) filter (where status='error')::int err from runs where ts > now() - interval '1 day'`;
  const worst=(await health(q,1))[0];
  return <div className="bot" style={{display:"flex",gap:24}}>
    <div><b style={{fontSize:22}}>{t.n}</b><div className="muted">runs today</div></div>
    <div><b style={{fontSize:22,color:t.err?"#c5221f":undefined}}>{t.err}</b><div className="muted">failed</div></div>
    {worst&&<div><b>{worst.name}</b><div className="muted">needs a look (<a href="/health">health</a>)</div></div>}</div>;
}
```

`app/page.js`: `import Today from "./today";` and put `<Today q={q}/>` right after `<main>`.

## 4. Demo

nothing to add: page reads `runs`, which demo already fills. check `DEMO_MODE=1 npx next start` → `/health` shows bars.

## 5. Test and ship

`npm run build`, open `/` and `/health`, add a `| /health | ... |` row to README pages table, commit, push, `grugbot deploy --source .`.
