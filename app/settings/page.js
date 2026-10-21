import { sql, DEMO, ensureBots } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { provider } from "@/lib/alerts";
import { EDITOR_DOCS } from "@/lib/links";
import Nav from "../nav";
import { enabledPlugins } from "@/plugins";
import { CATALOG } from "@/plugins/catalog.gen.js";
import Form from "./form";
import EditorCard from "./editor-card";
export const dynamic="force-dynamic";
export default async function P(){ const q=sql(), s=await getSettings(q), p=provider();
  let models=[]; try{ await ensureBots(q); models=(await q`select distinct model from token_usage where model<>'unknown' order by 1 limit 20`).map(r=>r.model); }catch{}
  return <><Nav/><main style={{maxWidth:1100}}><h2>Settings</h2><EditorCard docs={EDITOR_DOCS} demo={DEMO}/><Form initial={s} plugins={CATALOG} hook={!!process.env.VERCEL_DEPLOY_HOOK_URL} pluginSettings={Object.fromEntries(enabledPlugins(s).filter(x=>x.Settings).map(x=>[x.name,<x.Settings key={x.name} initial={s} models={models}/>]))} mail={{configured:!!p,from:p?.from||null}}/></main></>; }
