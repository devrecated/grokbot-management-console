#!/usr/bin/env bash
# View box logs. logs.sh [-s source] [-l level] [-t since e.g. 2h|1d|2026-10-20] [-g text] [-n 50] | logs.sh sources
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 - "$DIR/logs/box-logs.db" "$@" <<'PY'
import sys, sqlite3, time, re, argparse
db=sqlite3.connect(sys.argv[1])
if sys.argv[2:3]==["sources"]:
    for r in db.execute("select source,count(*),max(ts) from logs group by source order by 3 desc"): print(f"{r[0]:32} {r[1]:>7}  last {r[2]}")
    sys.exit()
a=argparse.ArgumentParser(); a.add_argument("-s"); a.add_argument("-l"); a.add_argument("-t"); a.add_argument("-g"); a.add_argument("-n",type=int,default=50)
o=a.parse_args(sys.argv[2:]); w=[]; p=[]
if o.s: w.append("source like ?"); p.append(f"%{o.s}%")
if o.l: w.append("level=?"); p.append(o.l)
if o.g: w.append("message like ?"); p.append(f"%{o.g}%")
if o.t:
    m=re.fullmatch(r"(\d+)([mhd])",o.t)
    since=time.strftime("%Y-%m-%dT%H:%M:%S",time.localtime(time.time()-int(m[1])*{"m":60,"h":3600,"d":86400}[m[2]])) if m else o.t
    w.append("ts>=?"); p.append(since)
q="select ts,level,source,message from logs"+(" where "+" and ".join(w) if w else "")+" order by ts desc, id desc limit ?"
for r in reversed(db.execute(q,p+[o.n]).fetchall()): print(f"{r[0]} {r[1]:5} {r[2]:20} {r[3]}")
PY
