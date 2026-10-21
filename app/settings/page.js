import { sql, DEMO, ensureBots } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { provider } from "@/lib/alerts";
import { EDITOR_DOCS } from "@/lib/links";
import Nav from "../nav";
import { PLUGINS } from "@/plugins";
import Form from "./form";
import EditorCard from "./editor-card";
export const dynamic="force-dynamic";
export default async function P(){ const q=sql(), s=await getSettings(q), p=provider();
  let models=[]; try{ await ensureBots(q); models=(await q`select distinct model from token_usage where model<>'unknown' order by 1 limit 20`).map(r=>r.model); }catch{}
  return <><Nav/><main style={{maxWidth:1100}}><h2>Settings</h2><EditorCard docs={EDITOR_DOCS} demo={DEMO}/><Form initial={s} plugins={PLUGINS.map(p=>({name:p.name,title:p.title,description:p.description,enabled:p.enabled}))} models={models} mail={{configured:!!p,from:p?.from||null}}/></main></>; }
