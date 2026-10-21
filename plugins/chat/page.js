// /p/chat: threads with your routines through the Grok Bot inbox webhook (POST /api/chat, core, so Routines actions keep working).
import { ensure, ensureMessages } from "@/lib/db";
import Chat from "./chat.js";
export default async function ChatPage({q,settings:s}){
  await ensure(q); await ensureMessages(q);
  const routines=(await q`select bot, routine_id, name from routines order by name`).map(r=>({bot:r.bot,routine_id:r.routine_id,name:r.name}));
  return <div style={{maxWidth:1400,margin:"0 auto"}}><Chat routines={routines} alwaysChat={s.always_reply_in_chat} tz={s.timezone}/></div>;
}
