#!/usr/bin/env python3
"""Sync bot profiles and a CONTENT-FREE activity feed to the dashboard (/api/bots).
Per event we keep only: timestamp, bot, event type or tool name, and the target bot name when one bot hands work to another.
Never commands, arguments, messages, results or any other content. Bot ids are hashed. Fail-soft, incremental, skips when unchanged."""
import os, sys, json, glob, gzip, hashlib, sqlite3, time, urllib.request
DIR=os.path.dirname(os.path.abspath(__file__)); DB=os.path.join(DIR,"logs","box-logs.db")
ROOT=os.environ.get("AGENT_DATA","/home/box/agent-data")
h=lambda s: hashlib.sha256(("bot:"+s).encode()).hexdigest()[:12]
iso=lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime(t))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
def main():
    db=sqlite3.connect(DB,timeout=10)
    db.executescript("""create table if not exists bot_events(id integer primary key, ts text, bot text, kind text, tool text, target text);
      create table if not exists kv(k text primary key, v text);""")
    kv=lambda k,v=None: (db.execute("insert or replace into kv values(?,?)",(k,v)) if v is not None else (db.execute("select v from kv where k=?",(k,)).fetchone() or [None])[0])
    bots={}; names={}
    for p in glob.glob(f"{ROOT}/agents/*/profile.json"):
        aid=os.path.basename(os.path.dirname(p))
        try: d=json.load(open(p))
        except Exception: continue
        bots[h(aid)]={"key":h(aid),"name":str(d.get("name",""))[:80],"title":str(d.get("title",""))[:120],"description":str(d.get("description",""))[:400],"color":str(d.get("avatarColor",""))[:20]}
        names[aid]=bots[h(aid)]["name"]
    now=time.time(); new=[]
    # audit.jsonl: type + ts only
    for p in glob.glob(f"{ROOT}/agents/*/audit.jsonl"):
        aid=os.path.basename(os.path.dirname(p)); k=f"audit:{aid}"; st=os.stat(p); off=int(kv(k) or 0)
        if off>st.st_size: off=0
        if off==st.st_size: continue
        with open(p,"rb") as fh:
            fh.seek(off)
            for raw in fh:
                if not raw.endswith(b"\n"): break
                off+=len(raw)
                try: e=json.loads(raw)
                except Exception: continue
                new.append((str(e.get("ts",""))[:24] or iso(now),h(aid),"audit",str(e.get("type","event"))[:40],None))
        kv(k,str(off))
    # transcripts: tool names only. No timestamps in transcripts, so new lines get the time we saw them; a first read uses the file mtime.
    for p in glob.glob(f"{ROOT}/agent-transcripts/*/*.jsonl"):
        tid=os.path.basename(os.path.dirname(p)); k=f"tx:{p}"; st=os.stat(p); prev=kv(k); off=int(prev or 0)
        if off>st.st_size: off=0
        if off==st.st_size: continue
        ts=iso(st.st_mtime if prev is None else now); bot=h(tid) if tid in names else "subagents"
        with open(p,"rb") as fh:
            fh.seek(off)
            for raw in fh:
                if not raw.endswith(b"\n"): break
                off+=len(raw)
                try: parts=(json.loads(raw).get("message") or {}).get("content") or []
                except Exception: continue
                for c in parts:
                    if isinstance(c,dict) and c.get("type")=="tool_use":
                        tgt=None
                        if c.get("name")=="task":
                            a=(c.get("input") or {}).get("agentId"); tgt=names.get(a) if isinstance(a,str) else None
                        new.append((ts,bot,"tool",str(c.get("name",""))[:40],tgt))
        kv(k,str(off))
    if new: db.executemany("insert into bot_events(ts,bot,kind,tool,target) values(?,?,?,?,?)",new)
    db.execute("delete from bot_events where ts < ?",(iso(now-7*86400),)); db.commit()
    bots["subagents"]={"key":"subagents","name":"Subagents","title":"Short-lived helpers","description":"Work done by subagents and one-off sessions that have no bot profile.","color":""}
    bjson=json.dumps(sorted(bots.values(),key=lambda b:b["key"]),sort_keys=True); send_bots=kv("bots_sent")!=hashlib.sha256(bjson.encode()).hexdigest()
    cur=int(kv("bot_ship_cursor") or 0)
    rows=db.execute("select id,ts,bot,kind,tool,target from bot_events where id>? order by id limit 5000",(cur,)).fetchall()
    if not rows and not send_bots: return
    env=dict(l.rstrip("\n").split("=",1) for l in open(os.path.join(DIR,".env")) if "=" in l)
    body={"events":[{"ts":r[1],"bot":r[2],"kind":r[3],"tool":r[4],"target":r[5]} for r in rows]}
    if send_bots: body["bots"]=json.loads(bjson)
    req=urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/")+"/api/bots",data=gzip.compress(json.dumps(body).encode()),
        headers={"content-type":"application/json","content-encoding":"gzip","authorization":"Bearer "+env["ROUTINE_LOG_TOKEN"],"x-vercel-protection-bypass":env.get("VERCEL_BYPASS","")})
    urllib.request.build_opener(NoRedirect).open(req,timeout=15).read()
    if rows: kv("bot_ship_cursor",str(rows[-1][0]))
    if send_bots: kv("bots_sent",hashlib.sha256(bjson.encode()).hexdigest())
    db.commit(); print(f"bots: {len(bots)} profiles{' (sent)' if send_bots else ''}, {len(rows)} events shipped")
if __name__=="__main__":
    try: main()
    except Exception as e: print("bot sync failed:",type(e).__name__,getattr(e,"code",""),file=sys.stderr)
