# Recipe: swap plain CSS for Tailwind (and shadcn/ui)

**goal:** use Tailwind classes, and optionally shadcn/ui components, without breaking existing pages.
**time:** about 5 minutes for Tailwind; shadcn pieces a few minutes each. **new deps:** `tailwindcss`, `@tailwindcss/postcss` (shadcn adds a few more). grug note: this is the one recipe that makes the app less grug-simple. ask the user to confirm first.

## 1. Tailwind v4

```bash
npm i -D tailwindcss @tailwindcss/postcss
```

`postcss.config.mjs`:

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

top of `app/globals.css` (keep the old rules below, so nothing changes yet):

```css
@import "tailwindcss";
@layer base { button { cursor: pointer; } }
```

Tailwind's preflight resets margins and headings. if old pages look off, use the gentler import instead:
`@import "tailwindcss/theme" layer(theme); @import "tailwindcss/utilities" layer(utilities);` (no preflight).

## 2. Move one page at a time

start with a small one, like `app/settings/page.js`. replace `className="bot"` cards with
`className="rounded-lg border bg-white p-4 mb-4"` and so on. delete the old CSS rule only when no page uses it:
`rg -n 'className="bot"' app` should be empty first.

## 3. shadcn/ui (optional)

```bash
npx shadcn@latest init        # pick: Neutral, CSS variables yes, path alias @/ (jsconfig already has it)
npx shadcn@latest add button card dialog
```

it writes `components/ui/*.jsx` and `lib/utils.js` (check it didn't overwrite anything in `lib/`). use it:

```jsx
import { Button } from "@/components/ui/button";
<Button variant="destructive" onClick={...}>Pause all</Button>
```

good first swap: `app/pause-all.js` → shadcn `AlertDialog` instead of `confirm()`.

## 4. Deploy file list

if you deploy without the CLI, include `postcss.config.mjs`, `components.json` and `components/`. `grugbot deploy --source .` already takes the whole checkout.

## 5. Test and ship

`npm run build`, check every tab in `DEMO_MODE=1` (Bots, Routines, Logs, Chat, Box, Usage, Settings), screenshot, update README "Philosophy"/deps table (no longer plain CSS), commit, push, `grugbot deploy --source .`.
