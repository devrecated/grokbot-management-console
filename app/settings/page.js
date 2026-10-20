import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import Nav from "../nav";
import Form from "./form";
export const dynamic="force-dynamic";
export default async function P(){ const s=await getSettings(sql());
  return <><Nav/><main><h2>Settings</h2><Form initial={s}/></main></>; }
