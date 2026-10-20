import { sql, ensure, ensureMessages } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import Nav from "../nav";
import Chat from "../chat";
export const dynamic="force-dynamic";
export default async function ChatPage(){
  const q=sql(); await ensure(q); await ensureMessages(q);
  const routines=(await q`select bot, routine_id, name from routines order by name`).map(r=>({bot:r.bot,routine_id:r.routine_id,name:r.name}));
  return <><Nav active="chat"/><main style={{maxWidth:1400}}><Chat routines={routines} alwaysChat={(await getSettings(q)).always_reply_in_chat}/></main></>;
}
