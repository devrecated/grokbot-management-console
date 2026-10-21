// grugbox: the whole box side of GrugBot Console in one binary.
//   grugbox loop            collect + ship + bot sync forever (niced, one copy via logs/.loop.lock)
//   grugbox once            one pass, then exit
//   grugbox ensure-running  start the loop in the background if it is not running (fast no-op otherwise)
//   grugbox reply <thread_id> <text>
//   grugbox confirm <routine_id> ok|fail ['{json}'] ['note']
//   grugbox prompt <routine_id> <file>
//   grugbox log-run <bot> <routine_id> ok|error|skipped <summary> [seconds]
//   grugbox register <bot> <bot_id> <routine_id> <name> <schedule_or_trigger> <purpose> [active|paused]
//   grugbox logs [-s source] [-l level] [-t 1h|6h|24h|7d] [-g text] [-n 50]   (reads the server, the only log store)
//   grugbox sample          print one CPU/memory sample (JSON)
//   grugbox live <until_epoch_s>   stream CPU/memory every 2 s until then (started by the loop when Live is on)
// Data rules: logs are redacted twice; bot activity is tool names and times only; tokens are byte-count estimates;
// agent transcripts, shell histories, .env and token files never leave the box. HTTP goes through the system curl.
use regex::Regex;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SPOOL_MAX: u64 = 4 * 1024 * 1024; // unsent batches kept on disk; oldest dropped past this
const BATCH: usize = 5000;
const MAX_LINE: usize = 2000;
const MAX_NEW_PER_FILE: usize = 20000;
const BYTES_PER_TOKEN: f64 = 3.9; // raw transcript JSON bytes per o200k token, measured on real transcripts
const LIVE_EVERY_MS: u64 = 2000;

// ---------- small helpers ----------
fn dir() -> PathBuf {
    if let Ok(d) = std::env::var("GRUGBOX_DIR") { return PathBuf::from(d); }
    std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())).unwrap_or_else(|| PathBuf::from("."))
}
fn logs() -> PathBuf { dir().join("logs") }
fn now() -> f64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0) }
fn read(p: impl AsRef<Path>) -> String { fs::read_to_string(p).unwrap_or_default() }
fn env() -> HashMap<String, String> {
    read(dir().join(".env")).lines().filter_map(|l| l.split_once('=')).map(|(k, v)| (k.to_string(), v.to_string())).collect()
}
fn sha_hex(s: &str) -> String { Sha256::digest(s.as_bytes()).iter().map(|b| format!("{:02x}", b)).collect() }
fn trunc(s: &str, n: usize) -> String { s.chars().take(n).collect() }
fn civil(t: i64) -> (i64, i64, i64, i64, i64, i64) {
    let (days, secs) = (t.div_euclid(86400), t.rem_euclid(86400));
    let z = days + 719468; let era = z.div_euclid(146097); let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153; let d = doy - (153 * mp + 2) / 5 + 1; let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d, secs / 3600, secs % 3600 / 60, secs % 60)
}
fn fmt_t(t: i64) -> String { let (y, m, d, h, mi, s) = civil(t); format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}", y, m, d, h, mi, s) }
// Box-local offset in seconds, from `date +%z` once per process (the box clock zone).
fn offset() -> i64 {
    static O: OnceLock<i64> = OnceLock::new();
    *O.get_or_init(|| {
        let s = Command::new("date").arg("+%z").output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        if s.len() == 5 { let sign = if s.starts_with('-') { -1 } else { 1 }; let h: i64 = s[1..3].parse().unwrap_or(0); let m: i64 = s[3..5].parse().unwrap_or(0); sign * (h * 3600 + m * 60) } else { 0 }
    })
}
fn local(t: f64) -> String { fmt_t(t as i64 + offset()) }
fn utc(t: f64) -> String { fmt_t(t as i64) + "Z" }
fn off_str() -> String { let o = offset(); format!("{}{:02}:{:02}", if o < 0 { '-' } else { '+' }, o.abs() / 3600, o.abs() % 3600 / 60) }
fn run(cmd: &str, args: &[&str]) -> String {
    Command::new(cmd).args(args).stdin(Stdio::null()).stderr(Stdio::null()).output().ok().map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default()
}

// ---------- HTTP via curl. Secrets go in a 0600 header file, never on the command line. ----------
fn http(method: &str, path: &str, body: &[u8], gzip: bool) -> Result<(u16, String), String> {
    let e = env();
    let base = e.get("ROUTINE_LOG_URL").ok_or("no ROUTINE_LOG_URL in .env")?.trim_end_matches('/').to_string();
    let _ = fs::create_dir_all(logs());
    let hdr = logs().join(format!(".hdr{}", std::process::id()));
    {
        let mut f = fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&hdr).map_err(|e| e.to_string())?;
        let _ = write!(f, "content-type: application/json\nauthorization: Bearer {}\nx-vercel-protection-bypass: {}\n{}",
            e.get("ROUTINE_LOG_TOKEN").cloned().unwrap_or_default(), e.get("VERCEL_BYPASS").cloned().unwrap_or_default(), if gzip { "content-encoding: gzip\n" } else { "" });
    }
    let url = format!("{}{}", base, path);
    let mut args = vec!["-sS", "-m", "20", "-X", method, "-H"];
    let h = format!("@{}", hdr.display());
    args.push(&h);
    if method != "GET" { args.extend(["--data-binary", "@-"]); }
    args.extend(["-w", "\n%{http_code}", &url]);
    let out = Command::new("curl").args(&args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
        .and_then(|mut c| { if let Some(mut i) = c.stdin.take() { let _ = i.write_all(body); } c.wait_with_output() });
    let _ = fs::remove_file(&hdr);
    let o = out.map_err(|e| format!("curl: {}", e))?;
    let s = String::from_utf8_lossy(&o.stdout).into_owned();
    let (b, code) = s.rsplit_once('\n').unwrap_or(("", &s));
    let code: u16 = code.trim().parse().unwrap_or(0);
    if (200..300).contains(&code) { Ok((code, b.to_string())) } else { Err(format!("HTTP {}", code)) }
}
fn post_json(path: &str, v: &Value) -> Result<Value, String> {
    http("POST", path, v.to_string().as_bytes(), false).map(|(_, b)| serde_json::from_str(&b).unwrap_or(Value::Null))
}
fn gz(v: &Value) -> Vec<u8> {
    let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    let _ = e.write_all(v.to_string().as_bytes()); e.finish().unwrap_or_default()
}

// ---------- redaction (same rules as the dashboard docs; applied on collect and again on ship) ----------
struct Red { ansi: Regex, rules: Vec<(Regex, &'static str)>, lvl: Regex, ts: Regex, utc: Regex, digits: Regex }
fn red() -> &'static Red {
    static R: OnceLock<Red> = OnceLock::new();
    R.get_or_init(|| {
        let r = |p: &str| Regex::new(&format!("(?i){}", p)).unwrap();
        Red {
            ansi: Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").unwrap(),
            rules: vec![
                (r(r"\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{10,}"), "[REDACTED_GH]"),
                (r(r"\bcrsr_[A-Za-z0-9_\-]{8,}"), "[REDACTED_CRSR]"),
                (r(r"\b(sk|rk|pk)[-_](live|test|proj|ant)?[-_]?[A-Za-z0-9_\-]{12,}"), "[REDACTED_KEY]"),
                (r(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"), "[REDACTED_SLACK]"),
                (r(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS]"),
                (r(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"), "[REDACTED_JWT]"),
                (r(r#"(bearer|token|authorization)(\s*[:=]\s*|\s+)['"]?[A-Za-z0-9._~+/=\-]{12,}"#), "${1}${2}[REDACTED]"),
                (r(r#"(password|passwd|pwd|secret|api[_-]?key|access[_-]?key)("?\s*[:=]\s*)['"]?[^\s'",&]{4,}"#), "${1}${2}[REDACTED]"),
                (r(r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s@/]+@"), "${1}://[REDACTED]@"),
                (r(r"https?://[^\s/:@]+:[^\s/@]+@"), "https://[REDACTED]@"),
                (r(r"\b[A-Fa-f0-9]{40,}\b"), "[REDACTED_HEX]"),
            ],
            lvl: r(r"\b(fatal|panic|critical|error|err|fail(?:ed|ure)?|warn(?:ing)?|debug|trace)\b"),
            ts: Regex::new(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})").unwrap(),
            utc: Regex::new(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|\+00:?00)").unwrap(),
            digits: Regex::new(r"\d+").unwrap(),
        }
    })
}
fn redact(s: &str) -> String {
    let r = red(); let mut s = r.ansi.replace_all(s, "").into_owned();
    for (p, rep) in &r.rules { s = p.replace_all(&s, *rep).into_owned(); }
    s
}
fn level(s: &str) -> &'static str {
    let k = red().lvl.captures(s).map(|c| c[1].to_lowercase()).unwrap_or_default();
    if ["fatal", "panic", "crit", "err", "fail"].iter().any(|p| k.starts_with(p)) { "error" } else if k.starts_with("warn") { "warn" } else if k == "debug" || k == "trace" { "debug" } else { "info" }
}

// ---------- local state: one small JSON file (read offsets + a few markers). The server is the only log store. ----------
struct St { v: Value }
impl St {
    fn load() -> St {
        let _ = fs::create_dir_all(logs()); let _ = fs::set_permissions(logs(), fs::Permissions::from_mode(0o700));
        let mut v: Value = serde_json::from_str(&read(logs().join("state.json"))).unwrap_or(json!({}));
        for k in ["cursors", "kv"] { if !v[k].is_object() { v[k] = json!({}); } }
        St { v }
    }
    fn save(&self) {
        let p = logs().join("state.json"); let tmp = logs().join(".state.tmp");
        if fs::write(&tmp, self.v.to_string()).is_ok() { let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600)); let _ = fs::rename(&tmp, &p); }
    }
    fn get(&self, k: &str) -> Option<String> { self.v["kv"][k].as_str().map(String::from) }
    fn set(&mut self, k: &str, val: &str) { self.v["kv"][k] = json!(val); }
    fn cur(&self, p: &str) -> Option<(u64, u64)> { let c = &self.v["cursors"][p]; Some((c[0].as_u64()?, c[1].as_u64()?)) }
    fn set_cur(&mut self, p: &str, ino: u64, off: u64) { self.v["cursors"][p] = json!([ino, off]); }
}
type Row = (String, String, String, String); // ts, source, level, message

// ---------- spool: unsent batches as small gzip files, sent oldest first, capped ----------
fn spool_dir() -> PathBuf { logs().join("spool") }
fn spool_put(kind: &str, body: &[u8]) {
    let d = spool_dir(); let _ = fs::create_dir_all(&d);
    let n = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let p = d.join(format!("{:020}-{}.json.gz", n, kind));
    let _ = fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&p).and_then(|mut f| f.write_all(body));
    let mut files = spool_files(); let mut total: u64 = files.iter().map(|f| f.1).sum();
    while total > SPOOL_MAX && files.len() > 1 { let (p, sz) = files.remove(0); let _ = fs::remove_file(&p); total -= sz; eprintln!("spool full: dropped oldest batch"); }
}
fn spool_files() -> Vec<(PathBuf, u64)> {
    let mut v: Vec<(PathBuf, u64)> = fs::read_dir(spool_dir()).map(|rd| rd.flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".json.gz")).map(|e| (e.path(), e.metadata().map(|m| m.len()).unwrap_or(0))).collect()).unwrap_or_default();
    v.sort(); v
}
// Send spooled batches oldest first; stop at the first failure (server down = try next pass).
fn spool_flush() -> bool {
    for (p, _) in spool_files() {
        let kind = if p.to_string_lossy().ends_with("-bots.json.gz") { "/api/bots" } else { "/api/logs" };
        let Ok(b) = fs::read(&p) else { continue };
        match http("POST", kind, &b, true) { Ok(_) => { let _ = fs::remove_file(&p); } Err(_) => return false }
    }
    true
}
// POST now, or spool it if the server is unreachable. Ok(reply) only when sent.
fn send(kind: &str, body: &Value, spool_ok: bool) -> Option<String> {
    let path = format!("/api/{}", kind); let gzb = gz(body);
    match http("POST", &path, &gzb, true) {
        Ok((_, r)) => Some(r),
        Err(e) => { if spool_ok { spool_put(kind, &gzb); eprintln!("{} send failed ({}), spooled", kind, e); } else { eprintln!("{} send failed ({})", kind, e); } None }
    }
}

// ---------- collect ----------
fn skip_dir() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(/agent-data/|/node_modules/|/chrome-profile/|google-chrome|mcp-chrome|/Default/|leveldb|/\.git/|/var/log/journal/|/routine-log/logs/|/grugbot-console/logs/|/sand-data/plugins/)").unwrap())
}
fn deny() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)(_history$|\.bash_history|\.zsh_history|\.python_history|transcript|secret|cookie|\.env$|\.env\.|\.token|credential|\.pem$|\.key$)").unwrap())
}
// Recursive walk like Python glob("**"): no dot entries, no symlinked dirs, pruned at skipped dirs.
fn walk(d: &Path, keep: &dyn Fn(&str) -> bool, out: &mut HashSet<String>, depth: u32) {
    if depth > 12 { return; }
    let Ok(rd) = fs::read_dir(d) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') { continue; }
        let p = e.path(); let ps = p.to_string_lossy().into_owned();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() { if !skip_dir().is_match(&(ps.clone() + "/")) { walk(&p, keep, out, depth + 1); } }
        else if keep(&name) { out.insert(ps); }
    }
}
fn is_text(p: &str) -> bool {
    let mut b = [0u8; 4096];
    fs::File::open(p).and_then(|mut f| f.read(&mut b)).map(|n| !b[..n].contains(&0)).unwrap_or(false)
}
fn collect(st: &mut St) -> Vec<Row> {
    let t = now(); let nowl = local(t); let mut all: Vec<Row> = Vec::new();
    let home = std::env::var("HOME").unwrap_or_default(); let d = dir();
    let mut files = HashSet::new();
    walk(Path::new("/var/log"), &|_| true, &mut files, 0);
    walk(Path::new("/tmp"), &|n| n.ends_with(".log") || n.ends_with(".out") || n.ends_with(".err"), &mut files, 0);
    walk(&Path::new(&home).join(".cache"), &|n| n.ends_with(".log"), &mut files, 0);
    if let Ok(rd) = fs::read_dir(Path::new(&home).join(".npm/_logs")) { for e in rd.flatten() { let p = e.path().to_string_lossy().into_owned(); if p.ends_with(".log") { files.insert(p); } } }
    for n in ["runs.jsonl", "registry.jsonl"] { let p = d.join(n); if p.exists() { files.insert(p.to_string_lossy().into_owned()); } }
    // regular files running processes (this user) write stdout/stderr to
    if let Ok(rd) = fs::read_dir("/proc") { for e in rd.flatten() {
        if !e.file_name().to_string_lossy().chars().all(|c| c.is_ascii_digit()) { continue; }
        for fd in ["1", "2"] { if let Ok(l) = fs::read_link(e.path().join("fd").join(fd)) { if l.is_file() { files.insert(l.to_string_lossy().into_owned()); } } }
    } }
    let binary = ["wtmp", "btmp", "lastlog", "faillog"];
    let mut files: Vec<String> = files.into_iter().filter(|f| {
        let base = f.rsplit('/').next().unwrap_or("");
        Path::new(f).is_file() && !skip_dir().is_match(f) && !binary.contains(&base) && !deny().is_match(f) && fs::File::open(f).is_ok()
    }).collect();
    files.sort();
    let nfiles = files.len();
    for f in &files {
        let stc = &mut *st; let Ok(md) = fs::metadata(f) else { continue };
        let row = stc.cur(f).map(|(a, b)| (a as i64, b as i64));
        let size = md.len() as i64; let ino = md.ino() as i64;
        let mut off = match row { Some((i, o)) if i == ino && o <= size => o, _ => 0 };
        if off == size { continue; }
        if off == 0 && !is_text(f) { stc.set_cur(f, ino as u64, size as u64); continue; }
        let mut src = f.strip_prefix("/tmp/").or_else(|| f.strip_prefix("/var/log/")).map(|s| s.to_string()).unwrap_or_else(|| f.replacen(&(home.clone() + "/"), "~/", 1));
        if src.starts_with('/') { src = f.rsplit('/').next().unwrap_or(f).to_string(); }
        let Ok(fh) = fs::File::open(f) else { continue };
        let mut r = BufReader::new(fh);
        let _ = r.seek(SeekFrom::Start(off as u64));
        if off == 0 && size > 5_000_000 { let _ = r.seek(SeekFrom::Start((size - 5_000_000) as u64)); let mut x = Vec::new(); let _ = r.read_until(b'\n', &mut x); off = size - 5_000_000 + x.len() as i64; }
        let (mut rows, mut prev, mut rep): (Vec<(String, String, String)>, Option<String>, usize) = (Vec::new(), None, 0);
        let mut raw = Vec::new();
        loop {
            raw.clear();
            match r.read_until(b'\n', &mut raw) { Ok(0) | Err(_) => break, _ => {} }
            if !raw.ends_with(b"\n") { break; }
            off += raw.len() as i64;
            let line = String::from_utf8_lossy(&raw).trim_end().to_string();
            if line.trim().is_empty() { continue; }
            let line = trunc(&redact(&line), MAX_LINE);
            let mut lv = level(&line).to_string();
            if src == "runs.jsonl" { if let Ok(j) = serde_json::from_str::<Value>(&line) { lv = match j["status"].as_str() { Some("error") => "error", Some("skipped") => "warn", _ => "info" }.into(); } }
            let key = red().digits.replace_all(&line, "#").into_owned();
            if Some(&key) == prev.as_ref() { rep += 1; continue; }
            if rep > 0 { let (ts, l) = (rows.last().unwrap().0.clone(), rows.last().unwrap().1.clone()); rows.push((ts, l, format!("(previous line repeated {} more times)", rep))); rep = 0; }
            prev = Some(key);
            let head: String = line.chars().take(60).collect();
            let ts = red().ts.captures(&head).map(|m| format!("{}T{}", &m[1], &m[2])).unwrap_or_else(|| nowl.clone());
            rows.push((ts, lv, line));
            if rows.len() >= MAX_NEW_PER_FILE { break; }
        }
        if rep > 0 { rows.push((nowl.clone(), "info".into(), format!("(previous line repeated {} more times)", rep))); }
        for (ts, lv, m) in rows { all.push((ts, src.clone(), lv, m)); }
        stc.set_cur(f, ino as u64, off as u64);
    }
    collect_dmesg(st, &mut all); collect_journal(st, &nowl, &mut all); collect_network(st, &nowl, &mut all);
    // forget cursors of files that are gone, so state.json stays small
    let keep: HashSet<&String> = files.iter().collect();
    if let Some(m) = st.v["cursors"].as_object_mut() { m.retain(|k, _| keep.contains(k)); }
    println!("collected {} new lines from {} files", all.len(), nfiles);
    all
}
fn collect_dmesg(c: &mut St, out: &mut Vec<Row>) {
    let dm = run("dmesg", &["--time-format", "iso", "--nopager"]);
    let last = c.get("dmesg_last").unwrap_or_default();
    let k = |l: &str| l.get(..31.min(l.len())).unwrap_or(l).to_string();
    let new: Vec<&str> = dm.lines().filter(|l| last.is_empty() || k(l) > last).collect();
    if new.is_empty() { return; }
    for l in &new { out.push((l.get(..19).unwrap_or("").to_string(), "kernel (dmesg)".into(), level(l).into(), trunc(&redact(l), MAX_LINE))); }
    c.set("dmesg_last", &k(new[new.len() - 1]));
}
fn collect_journal(c: &mut St, nowl: &str, out: &mut Vec<Row>) {
    let cur = c.get("journal_cursor");
    let mut a = vec!["--no-pager", "-o", "short-iso", "--show-cursor", "-q"];
    let cs; if let Some(x) = &cur { cs = x.clone(); a.extend(["--after-cursor", &cs]); } else { a.extend(["-n", "2000"]); }
    for l in run("journalctl", &a).lines() {
        if let Some(x) = l.strip_prefix("-- cursor: ") { c.set("journal_cursor", x); continue; }
        let head = l.get(..19).unwrap_or("");
        let ts = if red().ts.is_match(head) { head.to_string() } else { nowl.to_string() };
        out.push((ts, "journal".into(), level(l).into(), trunc(&redact(l), MAX_LINE)));
    }
}
fn collect_network(c: &mut St, nowl: &str, out: &mut Vec<Row>) {
    let mut cur: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    for l in read("/proc/net/dev").lines().skip(2) {
        if let Some((n, d)) = l.split_once(':') { let f: Vec<u64> = d.split_whitespace().filter_map(|x| x.parse().ok()).collect(); if f.len() > 8 { cur.insert(n.trim().into(), (f[0], f[8])); } }
    }
    let prev: Value = c.get("netdev").and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}));
    c.set("netdev", &json!(cur.iter().map(|(k, v)| (k.clone(), json!([v.0, v.1]))).collect::<serde_json::Map<_, _>>()).to_string());
    let hb = |b: u64| if b >= 1_000_000 { format!("{:.1}MB", b as f64 / 1e6) } else { format!("{:.0}kB", b as f64 / 1e3) };
    let parts: Vec<String> = cur.iter().filter(|(n, _)| *n != "lo" && prev.get(n.as_str()).is_some()).map(|(n, v)| {
        let p = &prev[n.as_str()]; format!("{} rx {} tx {}", n, hb(v.0.saturating_sub(p[0].as_u64().unwrap_or(0))), hb(v.1.saturating_sub(p[1].as_u64().unwrap_or(0))))
    }).collect();
    let (mut states, mut peers): (BTreeMap<String, u32>, HashMap<String, u32>) = (BTreeMap::new(), HashMap::new());
    for l in run("ss", &["-tunaH"]).lines() {
        let f: Vec<&str> = l.split_whitespace().collect(); if f.len() < 6 { continue; }
        *states.entry(format!("{}/{}", f[0], f[1])).or_default() += 1;
        if f[1] == "ESTAB" { let (h, p) = f[5].rsplit_once(':').unwrap_or((f[5], f[5])); *peers.entry(format!("{}:{}", h, p)).or_default() += 1; }
    }
    let mut pv: Vec<_> = peers.into_iter().collect(); pv.sort_by(|a, b| b.1.cmp(&a.1));
    let top = pv.iter().take(5).map(|(k, v)| format!("{} x{}", k, v)).collect::<Vec<_>>().join(", ");
    let msg = format!("net/min: {} | sockets {}{}", if parts.is_empty() { "baseline".into() } else { parts.join("; ") },
        states.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join(" "), if top.is_empty() { String::new() } else { format!(" | top peers {}", top) });
    out.push((nowl.to_string(), "network (summary)".into(), "info".into(), msg));
}

// ---------- box facts ----------
fn meminfo() -> HashMap<String, u64> {
    read("/proc/meminfo").lines().filter_map(|l| { let (k, v) = l.split_once(':')?; Some((k.to_string(), v.split_whitespace().next()?.parse().ok()?)) }).collect()
}
fn cpu_now() -> Option<(u64, u64)> {
    // only the first 8 fields: guest/guest_nice are already counted inside user/nice
    let f: Vec<u64> = read("/proc/stat").lines().next()?.split_whitespace().skip(1).take(8).filter_map(|x| x.parse().ok()).collect();
    if f.len() < 5 { None } else { Some((f[3] + f[4], f.iter().sum())) }
}
fn instance() -> Value {
    let rd = |p: &str| read(p).trim().to_string();
    let boot = rd("/proc/sys/kernel/random/boot_id"); let mut mid = rd("/etc/machine-id"); if mid.is_empty() { mid = rd("/var/lib/dbus/machine-id"); }
    let btime: u64 = read("/proc/stat").lines().find_map(|l| l.strip_prefix("btime ").and_then(|x| x.trim().parse().ok())).unwrap_or(0);
    let host = trunc(&rd("/proc/sys/kernel/hostname"), 64); let v = trunc(&rd(&dir().join("VERSION").to_string_lossy()), 40);
    json!({"machine_id": &sha_hex(&format!("grugbot-machine:{}", mid))[..16], "instance_id": &sha_hex(&format!("grugbot:{}:{}", boot, mid))[..16],
        "hostname": host, "boot_time": btime, "version": if v.is_empty() { "dev".to_string() } else { v }})
}
fn os_info() -> Value {
    let distro = read("/etc/os-release").lines().find_map(|l| l.strip_prefix("PRETTY_NAME=").map(|x| x.trim_matches('"').to_string())).unwrap_or("Linux".into());
    let cores = read("/proc/stat").lines().filter(|l| l.starts_with("cpu") && l.as_bytes().get(3).is_some_and(|c| c.is_ascii_digit())).count();
    json!({"distro": distro, "kernel": read("/proc/sys/kernel/osrelease").trim(), "arch": std::env::consts::ARCH, "cores": cores, "ram_mb": meminfo().get("MemTotal").copied().unwrap_or(0) / 1024})
}
// One sample: box CPU % since the previous sample (dropped after a long gap), memory = MemTotal - MemAvailable, load,
// plus this agent's own CPU (% of one core, including curl/dmesg/ss children) and memory.
fn sample(max_gap: f64) -> Value {
    let p = logs().join(".cpustat"); let t = now();
    let (cpu, ok) = match cpu_now() { Some(c) => (c, true), None => ((0, 0), false) };
    let prev: Option<Vec<f64>> = serde_json::from_str(&read(&p)).ok();
    let mut pct = Value::Null;
    if let Some(v) = &prev { if ok && v.len() >= 3 && cpu.1 as f64 > v[1] && t - v[2] <= max_gap {
        pct = json!(((1000.0 * (1.0 - (cpu.0 as f64 - v[0]) / (cpu.1 as f64 - v[1]))).round() / 10.0));
    } }
    let _ = fs::write(&p, json!([cpu.0, cpu.1, t]).to_string());
    let m = meminfo(); let tot = m.get("MemTotal").copied().unwrap_or(0) / 1024;
    let load: f64 = read("/proc/loadavg").split_whitespace().next().and_then(|x| x.parse().ok()).unwrap_or(0.0);
    let (ac, rss) = agent_self(t);
    json!({"cpu": pct, "mem_used_mb": tot - m.get("MemAvailable").copied().unwrap_or(0) / 1024, "mem_total_mb": tot, "load1": (load * 100.0).round() / 100.0,
        "agent_cpu": ac, "agent_rss_mb": rss})
}
fn agent_self(t: f64) -> (Value, f64) {
    let st = read("/proc/self/stat"); let f: Vec<f64> = st.rsplit_once(')').map(|(_, r)| r.split_whitespace().filter_map(|x| x.parse().ok()).collect()).unwrap_or_default();
    // fields after ")": state=0 ... utime=11 stime=12 cutime=13 cstime=14 (state is not numeric so indexes shift by one)
    let ticks = if f.len() > 13 { f[10] + f[11] + f[12] + f[13] } else { 0.0 };
    let p = logs().join(".agentstat"); let prev: Option<Vec<f64>> = serde_json::from_str(&read(&p)).ok();
    let _ = fs::write(&p, json!([ticks, t]).to_string());
    let rss = read("/proc/self/status").lines().find_map(|l| l.strip_prefix("VmHWM:").and_then(|x| x.split_whitespace().next()?.parse::<f64>().ok())).unwrap_or(0.0) / 1024.0;
    let cpu = match prev { Some(v) if v.len() == 2 && t > v[1] && ticks >= v[0] && t - v[1] < 3600.0 => json!(((ticks - v[0]) / 100.0 / (t - v[1]) * 10000.0).round() / 100.0), _ => Value::Null };
    (cpu, (rss * 10.0).round() / 10.0)
}

// ---------- settings (cached 5 min) ----------
fn settings() -> (u64, u64) {
    let p = logs().join(".settings");
    let clean = |v: &Value| {
        let g = |k: &str, ok: &[u64]| v[k].as_u64().filter(|x| ok.contains(x)).unwrap_or(60);
        (g("ship_interval_s", &[15, 30, 60, 300, 600]), g("heartbeat_interval_s", &[30, 60, 300, 600]))
    };
    let fresh = fs::metadata(&p).and_then(|m| m.modified()).ok().and_then(|m| m.elapsed().ok()).is_some_and(|e| e.as_secs() < 300);
    let cached: Value = serde_json::from_str(&read(&p)).unwrap_or(json!({}));
    if fresh { return clean(&cached); }
    let v = http("GET", "/api/settings", b"", false).ok().and_then(|(_, b)| serde_json::from_str::<Value>(&b).ok()).unwrap_or(cached);
    let s = clean(&v);
    let _ = fs::write(&p, json!({"ship_interval_s": s.0, "heartbeat_interval_s": s.1}).to_string()); s
}

// ---------- ship logs + heartbeat ----------
fn glob_match(p: &str, s: &str) -> bool {
    let (p, s): (Vec<char>, Vec<char>) = (p.chars().collect(), s.chars().collect());
    fn m(p: &[char], s: &[char]) -> bool { match p.first() { None => s.is_empty(), Some('*') => (0..=s.len()).any(|i| m(&p[1..], &s[i..])), Some('?') => !s.is_empty() && m(&p[1..], &s[1..]), Some(c) => s.first() == Some(c) && m(&p[1..], &s[1..]) } }
    m(&p, &s)
}
fn due(p: &Path, secs: u64) -> bool { fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|m| m.elapsed().ok()).map_or(true, |e| e.as_secs() + 3 >= secs) }
// Collect + send when the ship interval is due; heartbeat (with a CPU/memory sample) when that is due. Unsent = spool.
fn ship(st: &mut St, pass_ms: u64) {
    let cfg: Value = serde_json::from_str(&read(dir().join("ship-config.json"))).unwrap_or(json!({"allow":["*"],"deny":[]}));
    let arr = |k: &str| cfg[k].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>();
    let (allow, deny_) = (arr("allow"), arr("deny"));
    let ok = |s: &str| allow.iter().any(|p| glob_match(p, s)) && !deny_.iter().any(|p| glob_match(p, s));
    let cat = serde_json::to_string(&cfg["catalog"]).unwrap_or_default(); let send_cat = st.get("catalog_sent").as_deref() != Some(cat.as_str());
    let (ship_s, hb_s) = settings();
    let hb = logs().join(".heartbeat"); let stale = due(&hb, hb_s); let shp = logs().join(".shipped"); let ship_due = due(&shp, ship_s);
    let flushed = spool_flush();
    let rows = if ship_due { collect(st) } else { Vec::new() };
    if rows.is_empty() && !send_cat && !stale { return; }
    let off = off_str();
    let batch: Vec<Value> = rows.iter().filter(|r| ok(&r.1)).map(|r| {
        let head: String = r.3.chars().take(80).collect();
        json!({"ts": format!("{}{}", r.0, if red().utc.is_match(&head) { "Z".to_string() } else { off.clone() }), "source": r.1, "level": r.2, "message": redact(&r.3)})
    }).collect();
    let mut inst = instance(); let iid = inst["instance_id"].as_str().unwrap_or("").to_string();
    if stale { let mut s = sample(900.0); s["agent_pass_ms"] = json!(pass_ms); inst["sample"] = s; }
    let send_os = st.get("os_sent").as_deref() != Some(iid.as_str());
    if send_os { inst["os"] = os_info(); }
    let chunks: Vec<&[Value]> = if batch.is_empty() { vec![&[][..]] } else { batch.chunks(BATCH).collect() };
    let mut sent = 0;
    for (n, ch) in chunks.iter().enumerate() {
        let mut body = json!({"instance": if n == 0 { inst.clone() } else { instance() }, "rows": ch});
        if n == 0 && send_cat { body["catalog"] = cfg["catalog"].clone(); }
        // spool only if earlier batches went out (keeps order) or nothing is waiting; never spool a bare heartbeat
        match if flushed { send("logs", &body, !ch.is_empty()) } else { if !ch.is_empty() { body["instance"].as_object_mut().map(|o| o.remove("sample")); spool_put("logs", &gz(&body)); } None } {
            Some(res) => {
                sent += ch.len();
                if n == 0 {
                    if send_os { st.set("os_sent", &iid); } if send_cat { st.set("catalog_sent", &cat); }
                    let lu = serde_json::from_str::<Value>(&res).ok().and_then(|v| v["live_until"].as_f64()).unwrap_or(0.0);
                    if lu / 1000.0 > now() { start_live((lu / 1000.0) as u64); }
                }
            }
            None => {}
        }
    }
    if stale { let _ = fs::write(&hb, ""); }
    if ship_due { let _ = fs::write(&shp, ""); }
    println!("shipped {} of {} new lines{}", sent, rows.len(), if sent < batch.len() { " (rest spooled)" } else { "" });
}

// ---------- bot activity + token estimates ----------
fn h12(s: &str) -> String { sha_hex(&format!("bot:{}", s))[..12].to_string() }
fn agent_base(c: &mut St, root: &str, aid: &str, t: f64) -> (u64, String) {
    // (system prompt bytes, model) for one bot, cached 1 h. Prompt size is not readable without SQLite and is tiny next to
    // the conversation (0-6 kB measured), so it counts as 0. The model name is found by scanning the tail of the blob file.
    let k = format!("base:{}", aid);
    if let Some(v) = c.get(&k) { let p: Vec<&str> = v.splitn(3, '|').collect(); if p.len() == 3 && t - p[0].parse::<f64>().unwrap_or(0.0) < 3600.0 { return (p[1].parse().unwrap_or(0), p[2].to_string()); } }
    let (b, mut m) = (0u64, "unknown".to_string());
    if let Ok(mut f) = fs::File::open(format!("{}/agents/{}/conversation-blobs.db", root, aid)) {
        let len = f.metadata().map(|m| m.len()).unwrap_or(0); let _ = f.seek(SeekFrom::Start(len.saturating_sub(4 << 20)));
        let mut buf = Vec::new(); let _ = f.read_to_end(&mut buf);
        let re = regex::bytes::Regex::new(r#""modelName"\s*:\s*"([\w.\-]{1,60})""#).unwrap();
        if let Some(x) = re.captures_iter(&buf).last() { m = String::from_utf8_lossy(&x[1]).into_owned(); }
    }
    c.set(&k, &format!("{}|{}|{}", t, b, m)); (b, m)
}
fn bot_sync(c: &mut St) {
    let root = std::env::var("AGENT_DATA").unwrap_or("/home/box/agent-data".into());
    let ctx_cap = std::env::var("GRUGBOT_CTX_TOKENS").ok().and_then(|x| x.parse().ok()).unwrap_or(200000u64) as f64 * BYTES_PER_TOKEN;
    let mut bots: BTreeMap<String, Value> = BTreeMap::new(); let mut names: HashMap<String, String> = HashMap::new();
    let t = now(); let mut new: Vec<(String, String, String, String, Option<String>)> = Vec::new();
    let mut toks: BTreeMap<(String, String, String), (i64, i64, i64)> = BTreeMap::new();
    let agents: Vec<String> = fs::read_dir(format!("{}/agents", root)).map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
    for aid in &agents {
        let Ok(d) = serde_json::from_str::<Value>(&read(format!("{}/agents/{}/profile.json", root, aid))) else { continue };
        let s = |k: &str, n: usize| trunc(d[k].as_str().unwrap_or(""), n);
        let k = h12(aid);
        bots.insert(k.clone(), json!({"key": k, "name": s("name", 80), "title": s("title", 120), "description": s("description", 400), "color": s("avatarColor", 20)}));
        names.insert(aid.clone(), s("name", 80));
    }
    let tail = |c: &mut St, key: &str, p: &str, f: &mut dyn FnMut(&[u8])| -> Option<Option<String>> {
        let size = fs::metadata(p).ok()?.len(); let prev = c.get(key); let mut off: u64 = prev.as_deref().and_then(|x| x.parse().ok()).unwrap_or(0);
        if off > size { off = 0; } if off == size { return None; }
        let mut r = BufReader::new(fs::File::open(p).ok()?); r.seek(SeekFrom::Start(off)).ok()?;
        let mut raw = Vec::new();
        loop { raw.clear(); match r.read_until(b'\n', &mut raw) { Ok(0) | Err(_) => break, _ => {} } if !raw.ends_with(b"\n") { break; } off += raw.len() as u64; f(&raw); }
        c.set(key, &off.to_string()); Some(prev)
    };
    for aid in &agents { // audit.jsonl: type + ts only
        let p = format!("{}/agents/{}/audit.jsonl", root, aid); let b = h12(aid);
        tail(c, &format!("audit:{}", aid), &p, &mut |raw| if let Ok(e) = serde_json::from_slice::<Value>(raw) {
            let ts = trunc(e["ts"].as_str().unwrap_or(""), 24);
            new.push((if ts.is_empty() { utc(t) } else { ts }, b.clone(), "audit".into(), trunc(e["type"].as_str().unwrap_or("event"), 40), None));
        });
    }
    // transcripts: tool names only. One assistant line = one model call; input = system prompt + context so far (capped), output = reply bytes.
    let tdirs: Vec<PathBuf> = fs::read_dir(format!("{}/agent-transcripts", root)).map(|rd| rd.flatten().map(|e| e.path()).collect()).unwrap_or_default();
    for td in tdirs {
        let tid = td.file_name().unwrap().to_string_lossy().into_owned();
        let Ok(rd) = fs::read_dir(&td) else { continue };
        for f in rd.flatten() {
            let p = f.path().to_string_lossy().into_owned(); if !p.ends_with(".jsonl") { continue; }
            let key = format!("tx:{}", p); let had = c.get(&key).is_some();
            let mt = fs::metadata(&p).and_then(|m| m.modified()).ok().and_then(|m| m.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64()).unwrap_or(t);
            let ts = utc(if had { t } else { mt });
            let known = names.contains_key(&tid); let bot = if known { h12(&tid) } else { "subagents".into() };
            let mut cum: u64 = if had { c.get(&format!("cum:{}", p)).and_then(|x| x.parse().ok()).unwrap_or(0) } else { 0 };
            let base = if known { agent_base(c, &root, &tid, t) } else { (0, "unknown".into()) };
            let (mut calls, mut inp, mut out) = (0u64, 0f64, 0f64);
            let names_ref = &names;
            let r = tail(c, &key, &p, &mut |raw| {
                if let Ok(d) = serde_json::from_slice::<Value>(raw) {
                    let role = d["role"].as_str().or(d["message"]["role"].as_str()).unwrap_or("");
                    if role == "assistant" { calls += 1; inp += ((base.0 + cum) as f64).min(ctx_cap); out += raw.len() as f64; }
                    if let Some(parts) = d["message"]["content"].as_array() { for x in parts { if x["type"] == "tool_use" {
                        let tool = trunc(x["name"].as_str().unwrap_or(""), 40);
                        let tgt = if tool == "task" { x["input"]["agentId"].as_str().and_then(|a| names_ref.get(a).cloned()) } else { None };
                        new.push((ts.clone(), bot.clone(), "tool".into(), tool, tgt));
                    } } }
                }
                cum += raw.len() as u64;
            });
            if r.is_none() { continue; }
            c.set(&format!("cum:{}", p), &cum.to_string());
            if had && calls > 0 { // no backfill: history before the first read has no real times
                let t = toks.entry((format!("{}:00Z", &ts[..16]), bot.clone(), base.1.clone())).or_insert((0, 0, 0));
                t.0 += calls as i64; t.1 += (inp / BYTES_PER_TOKEN).round() as i64; t.2 += (out / BYTES_PER_TOKEN).round() as i64;
            }
        }
    }
    // forget offsets of transcripts/audit files that are gone
    if let Some(m) = c.v["kv"].as_object_mut() { m.retain(|k, _| !(k.starts_with("tx:") || k.starts_with("cum:")) || Path::new(k.splitn(2, ':').nth(1).unwrap_or("")).exists()); }
    bots.insert("subagents".into(), json!({"key":"subagents","name":"Subagents","title":"Short-lived helpers","description":"Work done by subagents and one-off sessions that have no bot profile.","color":""}));
    let bjson = Value::Array(bots.values().cloned().collect()).to_string(); let bhash = sha_hex(&bjson);
    let send_bots = c.get("bots_sent").as_deref() != Some(bhash.as_str());
    if new.is_empty() && !send_bots && toks.is_empty() { return; }
    let mut body = json!({"instance": instance(), "events": new.iter().map(|e| json!({"ts": e.0, "bot": e.1, "kind": e.2, "tool": e.3, "target": e.4})).collect::<Vec<_>>()});
    if send_bots { body["bots"] = serde_json::from_str(&bjson).unwrap(); }
    if !toks.is_empty() { body["tokens"] = toks.iter().map(|(k, v)| json!({"minute": k.0, "bot": k.1, "model": k.2, "calls": v.0, "input": v.1, "output": v.2})).collect(); }
    let sent = send("bots", &body, !new.is_empty() || !toks.is_empty()).is_some();
    if sent && send_bots { c.set("bots_sent", &bhash); }
    println!("bots: {} profiles{}, {} events, {} token rows {}", bots.len(), if send_bots && sent { " (sent)" } else { "" }, new.len(), toks.len(), if sent { "shipped" } else { "spooled" });
}

// ---------- live stream ----------
fn live_running() -> bool {
    let pid = read(logs().join(".live.pid")).trim().to_string();
    !pid.is_empty() && read(format!("/proc/{}/cmdline", pid)).contains("live")
}
fn start_live(until: u64) {
    if live_running() { return; }
    let Ok(exe) = std::env::current_exe() else { return };
    use std::os::unix::process::CommandExt;
    if let Ok(ch) = Command::new("nice").args(["-n", "19"]).arg(exe).args(["live", &until.to_string()]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).process_group(0).spawn() {
        let _ = fs::write(logs().join(".live.pid"), ch.id().to_string());
    }
}
fn live(mut until: u64) {
    let _ = fs::write(logs().join(".live.pid"), std::process::id().to_string());
    let iid = instance()["instance_id"].as_str().unwrap_or("").to_string();
    let (mut prev, mut batch, mut last, mut fails) = (cpu_now(), Vec::new(), Instant::now(), 0);
    while (now() as u64) < until {
        std::thread::sleep(Duration::from_millis(LIVE_EVERY_MS));
        let c = cpu_now();
        let pct = match (prev, c) { (Some((pi, pt)), Some((i, t))) if t > pt => json!(((1000.0 * (1.0 - (i - pi) as f64 / (t - pt) as f64)).round() / 10.0)), _ => Value::Null };
        prev = c; let m = meminfo(); let tot = m.get("MemTotal").copied().unwrap_or(0) / 1024;
        batch.push(json!({"t": (now() * 1000.0) as u64, "cpu": pct, "mem": tot - m.get("MemAvailable").copied().unwrap_or(0) / 1024, "tot": tot}));
        if last.elapsed() >= Duration::from_secs(6) {
            let body = json!({"instance_id": iid, "samples": batch}); batch = Vec::new(); last = Instant::now();
            match http("PUT", "/api/box/live", body.to_string().as_bytes(), false) {
                Ok((_, b)) => { fails = 0; if let Some(u) = serde_json::from_str::<Value>(&b).ok().and_then(|v| v["until"].as_u64()) { until = u; } } // server decides when to stop
                Err(_) => { fails += 1; if fails >= 5 { break; } }
            }
        }
    }
    let _ = fs::remove_file(logs().join(".live.pid"));
}

// ---------- loop ----------
fn pass(last_ms: u64) -> u64 {
    let t = Instant::now(); let mut st = St::load();
    ship(&mut st, last_ms); st.save(); bot_sync(&mut st); st.save();
    t.elapsed().as_millis() as u64
}
fn lock() -> Option<fs::File> {
    let _ = fs::create_dir_all(logs()); let _ = fs::set_permissions(logs(), fs::Permissions::from_mode(0o700));
    let f = fs::OpenOptions::new().create(true).write(true).truncate(false).open(logs().join(".loop.lock")).ok()?;
    f.try_lock().ok()?; Some(f)
}
fn run_loop() {
    let Some(_lk) = lock() else { println!("loop already running"); return };
    let me = std::process::id().to_string();
    let _ = Command::new("renice").args(["-n", "19", "-p", &me]).output(); let _ = Command::new("ionice").args(["-c3", "-p", &me]).output();
    let _ = fs::write(logs().join(".loop.pid"), &me);
    let mut ms = 0;
    loop {
        ms = pass(ms);
        // keep collector.out small (our stdout is appended there)
        let co = logs().join("collector.out");
        if fs::metadata(&co).map(|m| m.len()).unwrap_or(0) > 256 * 1024 {
            if let Ok(b) = fs::read(&co) { let tail = &b[b.len() - 64 * 1024..]; let _ = fs::OpenOptions::new().write(true).truncate(true).open(&co).and_then(|mut f| f.write_all(tail)); }
        }
        let (a, b) = settings();
        std::thread::sleep(Duration::from_secs(a.min(b)));
    }
}
fn ensure_running() {
    match lock() {
        None => {}
        Some(l) => {
            drop(l);
            let Ok(exe) = std::env::current_exe() else { return };
            use std::os::unix::process::CommandExt;
            let out = fs::OpenOptions::new().create(true).append(true).open(logs().join("collector.out")).ok();
            let mut cmd = Command::new(exe); cmd.arg("loop").stdin(Stdio::null()).process_group(0);
            if let Some(o) = out { let e = o.try_clone().ok(); cmd.stdout(o); if let Some(e) = e { cmd.stderr(e); } } else { cmd.stdout(Stdio::null()).stderr(Stdio::null()); }
            if cmd.spawn().is_ok() { println!("loop started"); }
        }
    }
}

// ---------- routine helpers ----------
fn die(m: &str, code: i32) -> ! { eprintln!("{}", m); std::process::exit(code) }
fn post_soft(ep: &str, v: &Value) { if !env().contains_key("ROUTINE_LOG_URL") { return; } if let Err(e) = post_json(&format!("/api/{}", ep), v) { eprintln!("routine-log: remote post skipped ({})", e); } }
fn append_locked(p: &Path, line: &str) {
    let mut f = fs::OpenOptions::new().create(true).append(true).open(p).unwrap_or_else(|e| die(&e.to_string(), 1));
    let _ = f.lock(); let _ = f.write_all(line.as_bytes()); let _ = f.sync_all();
}
fn now_local_iso() -> String { format!("{}{}", local(now()), off_str()) }
fn cmd_log_run(a: &[String]) {
    if a.len() != 4 && a.len() != 5 { die("usage: grugbox log-run bot routine_id ok|error|skipped summary [duration_seconds]", 2); }
    if !["ok", "error", "skipped"].contains(&a[2].as_str()) { die("status must be ok|error|skipped", 2); }
    let dur = a.get(4).map(|d| d.parse::<u32>().ok().filter(|x| *x < 1_000_000).unwrap_or_else(|| die("duration_seconds must be a whole number", 2)));
    let mut rec = json!({"ts": now_local_iso(), "bot": a[0], "routine_id": a[1], "status": a[2], "summary": trunc(&a[3].split_whitespace().collect::<Vec<_>>().join(" "), 200)});
    if let Some(d) = dur { rec["duration_s"] = json!(d); }
    append_locked(&dir().join("runs.jsonl"), &(rec.to_string() + "\n")); post_soft("runs", &rec);
}
fn cmd_register(a: &[String]) {
    if a.len() != 6 && a.len() != 7 { die("usage: grugbox register bot bot_id routine_id name schedule_or_trigger purpose [active|paused]", 2); }
    let status = a.get(6).cloned(); if let Some(s) = &status { if s != "active" && s != "paused" { die("status must be active|paused", 2); } }
    let mut rec = json!({"bot": a[0], "bot_id": a[1], "routine_id": a[2], "name": a[3], "schedule_or_trigger": a[4], "purpose": trunc(&a[5], 300), "updated_at": now_local_iso()});
    if let Some(s) = status { rec["status"] = json!(s); }
    let p = dir().join("registry.jsonl");
    let lk = fs::OpenOptions::new().create(true).write(true).truncate(false).open(dir().join("registry.jsonl.lock")).unwrap_or_else(|e| die(&e.to_string(), 1)); let _ = lk.lock();
    let mut out: String = read(&p).lines().filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok()).filter(|r| r["routine_id"] != rec["routine_id"]).map(|r| r.to_string() + "\n").collect();
    out += &(rec.to_string() + "\n");
    let tmp = dir().join(".registry.tmp"); fs::write(&tmp, out).unwrap(); let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o664)); fs::rename(&tmp, &p).unwrap();
    post_soft("register", &rec);
}
fn cmd_reply(a: &[String]) {
    if a.len() != 2 { die("usage: grugbox reply thread_id text", 2); }
    match post_json("/api/messages", &json!({"thread_id": a[0], "role": "grokbot", "text": a[1]})) { Ok(v) => println!("posted message {}", v["message_id"]), Err(e) => die(&format!("reply failed: {}", e), 1) }
}
fn cmd_confirm(a: &[String]) {
    if a.len() < 2 || a.len() > 4 { die("usage: grugbox confirm routine_id ok|fail ['{json}'] ['note']", 2); }
    if a[1] != "ok" && a[1] != "fail" { die("second arg must be ok|fail", 2); }
    let f: Value = serde_json::from_str(a.get(2).map(|s| s.as_str()).filter(|s| !s.is_empty()).unwrap_or("{}")).unwrap_or_else(|_| die("fields must be JSON", 2));
    let mut b = json!({"routine_id": a[0], "ok": a[1] == "ok", "note": a.get(3).cloned().unwrap_or_default()});
    for k in ["status", "schedule_or_trigger", "prompt"] { if !f[k].is_null() { b[k] = f[k].clone(); } }
    match post_json("/api/routines/confirm", &b) { Ok(v) => println!("{} message {}", if v["applied"].as_bool() == Some(true) { "confirmed" } else { "rejected" }, v["message_id"]), Err(e) => die(&format!("confirm failed: {}", e), 1) }
}
fn cmd_prompt(a: &[String]) {
    if a.len() != 2 { die("usage: grugbox prompt routine_id prompt_file", 2); }
    let text = fs::read_to_string(&a[1]).unwrap_or_else(|_| die("usage: grugbox prompt routine_id prompt_file", 2));
    match post_json("/api/routines/prompt", &json!({"routine_id": a[0], "prompt": text})) { Ok(v) => println!("prompt sent, {} chars", v["chars"]), Err(e) => die(&format!("prompt failed: {}", e), 1) }
}
// Read logs from the server (the only store). Same filters as the Logs page.
fn cmd_logs(a: &[String]) {
    let (mut q, mut n, mut i) = (vec![("range".to_string(), "24h".to_string())], 50usize, 0);
    let enc = |s: &str| s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{:02X}", b) }).collect::<String>();
    while i < a.len() {
        let v = a.get(i + 1).cloned().unwrap_or_default();
        match a[i].as_str() {
            "-s" => q.push(("source".into(), v)), "-l" => q.push(("level".into(), v)), "-g" => q.push(("q".into(), v)), "-e" => q.push(("re".into(), v)),
            "-t" => q[0].1 = v, "-n" => n = v.parse().unwrap_or(50),
            _ => die("usage: grugbox logs [-s source] [-l level] [-t 1h|6h|24h|7d] [-g text] [-e regex] [-n 50]", 2),
        }
        i += 2;
    }
    let path = format!("/api/logs?{}", q.iter().map(|(k, v)| format!("{}={}", k, enc(v))).collect::<Vec<_>>().join("&"));
    match http("GET", &path, b"", false) {
        Ok((_, b)) => { let v: Value = serde_json::from_str(&b).unwrap_or(json!({}));
            let rows = v["rows"].as_array().cloned().unwrap_or_default();
            for r in rows.iter().take(n).rev() { println!("{} {:5} {:20} {}", r["ts"].as_str().unwrap_or(""), r["level"].as_str().unwrap_or(""), r["source"].as_str().unwrap_or(""), r["message"].as_str().unwrap_or("")); } }
        Err(e) => die(&format!("logs failed: {} (server keeps the logs; check .env)", e), 1),
    }
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let rest = if a.len() > 1 { &a[1..] } else { &[][..] };
    match a.first().map(|s| s.as_str()).unwrap_or("") {
        "loop" => run_loop(),
        "once" => { pass(0); }
        "spool" => { let f = spool_files(); println!("{} batches, {} bytes waiting", f.len(), f.iter().map(|x| x.1).sum::<u64>()); }
        "ensure-running" => ensure_running(),
        "reply" => cmd_reply(rest), "confirm" => cmd_confirm(rest), "prompt" => cmd_prompt(rest),
        "log-run" => cmd_log_run(rest), "register" => cmd_register(rest), "logs" => cmd_logs(rest),
        "sample" => println!("{}", sample(900.0)), "os" => println!("{}", os_info()),
        "redact" => { let mut s = String::new(); let _ = std::io::stdin().read_to_string(&mut s); for l in s.lines() { println!("{}", redact(l)); } }
        "live" => live(rest.first().and_then(|x| x.parse().ok()).unwrap_or_else(|| die("usage: grugbox live <until_epoch_s>", 2))),
        "version" | "--version" => println!("grugbox {}", env!("CARGO_PKG_VERSION")),
        _ => die("usage: grugbox loop|once|ensure-running|reply|confirm|prompt|log-run|register|logs|sample|live|version", 2),
    }
}
