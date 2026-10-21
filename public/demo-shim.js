// DEMO_MODE only. Fakes every write in the browser so the demo feels real without a database.
// State lives in sessionStorage, so it is gone when the tab closes.
(function(){
  const real=window.fetch.bind(window), S=sessionStorage;
  const get=(k,d)=>{try{return JSON.parse(S.getItem(k))??d}catch{return d}}, put=(k,v)=>S.setItem(k,JSON.stringify(v));
  const json=(o)=>Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}));
  const replies=["Got it. (This is the demo, so nothing really happened, but a real bot would answer here.)","Sure, I would update the routine and confirm in this thread.","Noted. In the real console this message goes to Grok Bot through your webhook."];
  window.fetch=async function(input,init){
    const url=new URL(typeof input==="string"?input:input.url,location.href), m=(init?.method||"GET").toUpperCase();
    if(url.origin!==location.origin||!url.pathname.startsWith("/api/")) return real(input,init);
    const body=m==="POST"&&init?.body?JSON.parse(init.body):{};
    if(url.pathname==="/api/settings"){
      if(m==="POST"){ put("demo:settings",{...get("demo:settings",{}),...body}); }
      const base=await (await real("/api/settings")).json(); return json({...base,...get("demo:settings",{})});
    }
    if(url.pathname==="/api/alerts/test"&&m==="POST") return json({sent:false,reason:"demo mode never sends email"});
    if(url.pathname==="/api/actions"&&m==="POST"){
      if(body.action==="pause_all"||body.action==="resume_all") return json({ok:true,demo:true,delivered:true,count:document.querySelectorAll("tbody tr").length?1:0,note:"Demo: one "+body.action+" request would go to Grok Bot, then each routine confirms."});
      if(body.action==="cancel") return json({ok:true,cancelled:true});
      if(body.action==="fetch_prompt") return json({ok:true,fetching:true,delivered:true});
      return json({ok:true,delivered:true,thread_id:"routine:"+body.routine_id,pending:{action:body.action,schedule:body.schedule||null,human:body.action==="set_prompt"?`Update prompt (${String(body.prompt||"").length} chars)`:(body.human||body.action)}});
    }
    if(url.pathname==="/api/chat"){
      const mine=get("demo:chat",[]);
      if(m==="POST"){
        const tid=body.thread_id||("demo-"+Date.now()), now=Date.now();
        mine.push({id:"d"+now,thread_id:tid,role:"user",text:body.text,bot:body.bot,routine_id:body.routine_id,delivered:true,created_at:new Date(now).toISOString()});
        mine.push({id:"d"+now+"r",thread_id:tid,role:"grokbot",text:replies[mine.length%replies.length],bot:body.bot,routine_id:body.routine_id,created_at:new Date(now+1500).toISOString(),_at:now+1500});
        put("demo:chat",mine); return json({ok:true,thread_id:tid,message_id:"d"+now,delivered:true});
      }
      const j=await (await real(input,init)).json(), tid=url.searchParams.get("thread_id"), vis=mine.filter(x=>!x._at||x._at<=Date.now());
      for(const x of vis){ const t=j.threads.find(t=>t.thread_id===x.thread_id);
        if(t){ if(x.created_at>t.last_at) t.last_at=x.created_at; } else j.threads.push({thread_id:x.thread_id,last_at:x.created_at,first_text:x.text,bot:x.bot,routine_id:x.routine_id}); }
      j.threads.sort((a,b)=>a.last_at<b.last_at?1:-1);
      if(tid) j.messages=[...j.messages,...vis.filter(x=>x.thread_id===tid)];
      return json(j);
    }
    if(url.pathname==="/api/box/live"){  // fake live stream: a sample every 2 s from the browser
      if(m==="POST"){ const u=body.on?Date.now()+5*60e3:0; sessionStorage.setItem("demo:live",u); return json({ok:true,live_until:u}); }
      const u=Number(sessionStorage.getItem("demo:live")||0), since=Number(url.searchParams.get("since"))||0, rows=[];
      if(u>Date.now()) for(let t=Math.max(since+2000,Date.now()-60e3); t<=Date.now(); t+=2000){ const b=Math.sin(t/20000)>0.7; rows.push({t,cpu:Math.round((b?30+Math.random()*40:3+Math.random()*6)*10)/10,mem:3100+Math.round(Math.random()*300+(b?1500:0)),tot:16000}); }
      return json({live_until:u>Date.now()?u:0,rows});
    }
    if(m!=="GET") return json({ok:true,demo:true,delivered:true});
    return real(input,init);
  };
})();
