// Usage settings. Merged into the one settings row by lib/settings.js (pure: no imports, safe on server and client).
export const DEFAULTS={ cost_per_run:0, cost_per_action:0, cost_per_run_minute:0, currency:"USD",
  // Your own prices per 1M tokens, per model: [{model, input, output}]. Empty until you set them; nothing is assumed.
  token_prices:[] };
const money=v=>v>=0&&v<1e6;
export const RULES={ cost_per_run:money, cost_per_action:money, cost_per_run_minute:money, currency:v=>/^[A-Z]{3}$/.test(v),
  token_prices:v=>Array.isArray(v)&&v.length<=50&&v.every(p=>p&&typeof p.model==="string"&&p.model.length>0&&p.model.length<=60&&[p.input,p.output].every(n=>typeof n==="number"&&n>=0&&n<1e6)) };
