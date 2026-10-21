// Fake data for DEMO_MODE. Every name, id and message here is made up.
// Times are minutes before "now" so the demo always looks fresh.
export const bots=[
  {key:"research",name:"Research Bot",title:"Reads papers and news, writes short briefs",color:"#2f6f4e",description:"Watches a few feeds and arXiv categories. Writes a morning brief and flags anything worth a closer look."},
  {key:"inbox",name:"Inbox Bot",title:"Sorts mail and drafts replies",color:"#7a4b9c",description:"Labels incoming mail, drafts replies for review and keeps a weekly digest of threads waiting on someone."},
  {key:"deploy",name:"Deploy Bot",title:"Watches builds and preview links",color:"#b5651d",description:"Checks CI on the main branches, posts preview links and opens an issue when a build stays red."},
  {key:"garden",name:"Garden Bot",title:"Weather, watering and seed reminders",color:"#4a7f9e",description:"Looks at the forecast every morning and reminds you to water when it has been dry."},
];
export const routines=[
  {routine_id:"rt_demo_brief",bot:"Research Bot",bot_id:"bot_demo_research",name:"Morning brief",schedule_or_trigger:"0 7 * * *",purpose:"Summarize overnight papers and news into five bullets",status:"active",
   prompt_text:"Every morning at 7, read the saved feeds and new arXiv listings in cs.CL and cs.LG.\nPick the five most useful items.\nWrite one bullet each, plain words, with a link.\nSkip anything already covered this week."},
  {routine_id:"rt_demo_deep",bot:"Research Bot",bot_id:"bot_demo_research",name:"Friday deep dive",schedule_or_trigger:"0 15 * * 5",purpose:"Longer write-up on one topic from the week",status:"active"},
  {routine_id:"rt_demo_triage",bot:"Inbox Bot",bot_id:"bot_demo_inbox",name:"Inbox triage",schedule_or_trigger:"*/30 8-18 * * 1-5",purpose:"Label new mail and draft replies",status:"active"},
  {routine_id:"rt_demo_digest",bot:"Inbox Bot",bot_id:"bot_demo_inbox",name:"Waiting-on digest",schedule_or_trigger:"0 9 * * 1",purpose:"List threads waiting on someone else",status:"paused"},
  {routine_id:"rt_demo_ci",bot:"Deploy Bot",bot_id:"bot_demo_deploy",name:"CI watch",schedule_or_trigger:"trigger: push to main",purpose:"Post build status and preview links",status:"active"},
  {routine_id:"rt_demo_water",bot:"Garden Bot",bot_id:"bot_demo_garden",name:"Watering check",schedule_or_trigger:"30 6 * * *",purpose:"Remind to water after two dry days",status:"active"},
];
export const summaries={
  rt_demo_brief:["Brief sent: 5 items, 2 on small-model distillation","Brief sent: 5 items, one new benchmark worth reading","Brief sent: quiet night, 3 items"],
  rt_demo_deep:["Deep dive on retrieval eval sets, 900 words"],
  rt_demo_triage:["Labeled 12, drafted 3 replies","Labeled 4, nothing to draft","Labeled 9, drafted 1 reply","Gmail rate limit, retried next slot"],
  rt_demo_digest:["4 threads waiting on others"],
  rt_demo_ci:["main green, preview link posted","main red: lint failed in web/, issue opened","main green after fix"],
  rt_demo_water:["Rained 6 mm, no reminder","Dry two days, reminder sent","Skipped: forecast unavailable"],
};
export const threads=[
  {thread_id:"demo-thread-1",bot:"Research Bot",routine_id:"rt_demo_brief",msgs:[
    ["user",300,"Can the morning brief skip anything about crypto?"],
    ["grokbot",298,"Done. I added a skip rule for crypto and token news to the Morning brief prompt. Tomorrow's brief will be the first one with it."],
    ["user",120,"Thanks. Also put the link first on each bullet."],
    ["grokbot",118,"Sure. Links now come first, then the one-line summary."]]},
  {thread_id:"routine:rt_demo_digest",bot:"Inbox Bot",routine_id:"rt_demo_digest",msgs:[
    ["user",2000,"Request: pause \"Waiting-on digest\" (rt_demo_digest). Pause until further notice"],
    ["grokbot",1995,"Paused. It will not run on Monday. Resume it from the dashboard when you want it back."]]},
  {thread_id:"demo-thread-2",bot:"Deploy Bot",routine_id:null,msgs:[
    ["user",60,"Why was main red this morning?"],
    ["grokbot",58,"Lint failed in web/ on an unused import. The next push fixed it and main has been green since."]]},
];
export const tools=["web_search","web_fetch","read_file","write_file","shell","send_email","calendar","github"];
export const logSources=[["journal","info"],["kernel","info"],["network","info"],["grokbot","info"],["routine-log","info"],["cron","info"],["grokbot","warn"],["network","warn"],["routine-log","error"]];
export const logLines={
  journal:["Started Session 41 of user box.","systemd-timesyncd: Synchronized to time server","Finished Daily apt download activities."],
  kernel:["eth0: link up, 1000 Mbps, full duplex","TCP: request_sock_TCP: Possible SYN flooding on port 8080. Sending cookies.","audit: type=1400 apparmor=\"STATUS\" operation=\"profile_load\""],
  network:["established 14, listen 6, time_wait 3","outbound to api.github.com:443 ok","dns lookup slow: 820 ms"],
  grokbot:["routine Morning brief started","routine Inbox triage finished in 41s","tool call web_fetch finished","retrying after 429 from upstream"],
  "routine-log":["shipped 24 of 24 new lines","heartbeat ok","ship failed: 502, will retry"],
  cron:["(box) CMD (/workspace/grugbot-console/ensure-running.sh)"],
};
export const instances=[
  {instance_id:"a1b2c3d4e5f60718",machine_id:"0f1e2d3c4b5a6978",hostname:"demo-box",bootMinAgo:2900,version:"demo",pingMinAgo:0.5,os:{distro:"Ubuntu 24.04.1 LTS",kernel:"6.8.0-48-generic",arch:"x86_64",cores:4,ram_mb:15987}},
  {instance_id:"9988776655443322",machine_id:"0f1e2d3c4b5a6978",hostname:"demo-box",bootMinAgo:9000,version:"demo",pingMinAgo:2950,os:{distro:"Ubuntu 24.04.1 LTS",kernel:"6.8.0-45-generic",arch:"x86_64",cores:4,ram_mb:15987}},
];

// Cost & usage demo rates (an estimate, labeled as such). Alerts on so Settings shows the editor; the demo never sends.
export const settings={cost_per_run:0.02,cost_per_run_minute:0.01,cost_per_action:0.001,alert_emails:true,alert_to:"you@example.com"};
