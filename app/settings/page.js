import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { provider } from "@/lib/alerts";
import Nav from "../nav";
import Form from "./form";
export const dynamic="force-dynamic";
export default async function P(){ const s=await getSettings(sql()), p=provider();
  return <><Nav/><main style={{maxWidth:1100}}><h2>Settings</h2><Form initial={s} mail={{configured:!!p,from:p?.from||null}}/></main></>; }
