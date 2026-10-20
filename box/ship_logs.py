#!/usr/bin/env python3
"""Ship NEW lines from the local SQLite (logs/box-logs.db) to the dashboard /api/logs in one gzipped POST.
Only allowlisted sources (ship-config.json). Re-redacts before sending. No POST when there is nothing new. Fail-soft."""
import os, sys, json, gzip, sqlite3, fnmatch, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_logs import redact
DIR=os.path.dirname(os.path.abspath(__file__)); DB=os.path.join(DIR,"logs","box-logs.db"); CUR=os.path.join(DIR,"logs",".ship_cursor")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
def main():
    cfg=json.load(open(os.path.join(DIR,"ship-config.json")))
    ok=lambda s: any(fnmatch.fnmatch(s,p) for p in cfg["allow"]) and not any(fnmatch.fnmatch(s,p) for p in cfg["deny"])
    db=sqlite3.connect(DB,timeout=10); last=int(open(CUR).read() or 0) if os.path.exists(CUR) else None
    top=db.execute("select coalesce(max(id),0) from logs").fetchone()[0]
    if last is None:  # first run: backfill only the last 24h
        since=time.strftime("%Y-%m-%dT%H:%M:%S",time.localtime(time.time()-86400))
        last=(db.execute("select min(id) from logs where ts>=?",(since,)).fetchone()[0] or top+1)-1
    rows=db.execute("select id,ts,source,level,message from logs where id>? order by id limit ?",(last,cfg.get("max_batch",2000))).fetchall()
    if not rows:
        open(CUR,"w").write(str(last)); return
    off=time.strftime("%z"); off=off[:3]+":"+off[3:]  # box-local times
    batch=[{"ts":r[1]+off,"source":r[2],"level":r[3],"message":redact(r[4])} for r in rows if ok(r[2])]
    if batch:
        env=dict(l.rstrip("\n").split("=",1) for l in open(os.path.join(DIR,".env")) if "=" in l)
        req=urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/")+"/api/logs",data=gzip.compress(json.dumps(batch).encode()),
            headers={"content-type":"application/json","content-encoding":"gzip","authorization":"Bearer "+env["ROUTINE_LOG_TOKEN"],"x-vercel-protection-bypass":env.get("VERCEL_BYPASS","")})
        urllib.request.build_opener(NoRedirect).open(req,timeout=15).read()  # raises on non-2xx -> cursor not advanced
    open(CUR,"w").write(str(rows[-1][0]))
    print(f"shipped {len(batch)} of {len(rows)} new lines")
if __name__=="__main__":
    try: main()
    except Exception as e: print("ship failed:",type(e).__name__,getattr(e,"code",""),file=sys.stderr)
