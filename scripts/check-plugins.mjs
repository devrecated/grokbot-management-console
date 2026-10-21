// Plugin safety check (CI + npm test). A plugin runs with full access to the server and database, so flag what it
// reaches for beyond what its plugin.json declares in "permissions": {"env": [...], "hosts": [...]}:
//   - process.env.X not in permissions.env
//   - http(s) URLs to hosts not in permissions.hosts (relative /api/... calls are fine)
//   - imports of packages that are not already dependencies of the console, or a plugin-level package.json
// Skips test/ (tests talk to $BASE). Exit 1 with a list when anything is undeclared.
// Usage: node scripts/check-plugins.mjs [pluginsDir]
import fs from "fs"; import path from "path"; import { builtinModules } from "module";
const root=process.argv[2]||"plugins";
const deps=new Set(Object.keys(JSON.parse(fs.readFileSync("package.json","utf8")).dependencies||{}));
const builtin=new Set([...builtinModules,...builtinModules.map(m=>"node:"+m)]);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==="test"||e.name==="node_modules"?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
const bad=[];
for(const d of fs.readdirSync(root).filter(d=>fs.existsSync(path.join(root,d,"plugin.json")))){
  const dir=path.join(root,d), m=JSON.parse(fs.readFileSync(path.join(dir,"plugin.json"),"utf8")), per=m.permissions||{};
  const env=new Set(per.env||[]), hosts=new Set(per.hosts||[]), flag=(f,w)=>bad.push(`${d}: ${w} (${path.relative(dir,f)})`);
  if(fs.existsSync(path.join(dir,"package.json"))) flag(path.join(dir,"package.json"),"has its own package.json; plugins may only use the console's dependencies");
  for(const f of walk(dir).filter(f=>/\.(m?js|jsx|ts|tsx|sh)$/.test(f))){ const s=fs.readFileSync(f,"utf8");
    for(const [,k] of s.matchAll(/process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[["'`]?([^"'`\]]*))/g)) if(!env.has(k||"")) flag(f,`reads env ${k||"(dynamic key)"} not in permissions.env`);
    for(const [,h] of s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if(!hosts.has(h.toLowerCase())) flag(f,`talks to ${h} not in permissions.hosts`);
    if(/\.(m?js|jsx|ts|tsx)$/.test(f)) for(const [,,a,b] of s.matchAll(/(import\s[^"'`]*?from\s*|import\s*\(\s*|require\s*\(\s*)["'`]([^"'`]+)["'`]|(?<=^|\n)import\s+["'`]([^"'`]+)["'`]/g)){
      const spec=a||b; if(!spec||spec.startsWith(".")||spec.startsWith("@/")||builtin.has(spec)) continue;
      const pkg=spec.startsWith("@")?spec.split("/").slice(0,2).join("/"):spec.split("/")[0]; if(!deps.has(pkg)) flag(f,`imports ${pkg}, not a console dependency`); } } }
if(bad.length){ console.error("plugin check: undeclared access\n  "+[...new Set(bad)].join("\n  ")+"\nDeclare it in plugin.json permissions (and review it), or remove it."); process.exit(1); }
console.log("plugin check: ok");
