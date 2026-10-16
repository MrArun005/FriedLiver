# FriedLiver design system

One stylesheet (`src/renderer/styles.css`) and one palette file
(`src/renderer/palettes.ts`). Components use tokens only: no raw colors, sizes
or spacing outside the token block. `test/palettes.test.ts` fails the build if
any theme drops below WCAG AA contrast.

## Audit, 2026-10-16

Before this pass:

| Category | Defined | Hardcoded values found |
|---|---|---|
| Colors | 19 tokens per theme | 1 (`rgba(0,0,0,.85)` lightbox scrim) |
| Spacing | none | 22 distinct padding values, 3 gap values |
| Typography | none | 3 font sizes, 2 font stacks |
| Radius | none | 6 values (0, 3, 4, 6, 8, mixed bubble) |
| Elevation and motion | none | none defined; overlays had no shadow |

Contrast, measured: code comments were 3.3 to 3.7:1 in every theme. White on
Midnight Blue's buttons was 4.1:1. Daylight Blue's accent was 4.3:1 and its
success color 4.0:1. All four now pass 4.5:1, and so does Daylight Blue's
warning color, which the new test caught at 4.49:1.

Component gaps:

| Component | States | Variants | Accessibility | Before | After |
|---|---|---|---|---|---|
| Button | hover only | default, primary, link | ok | 5/10 | 9/10: hover, active, disabled, focus-visible; primary, secondary, danger, ghost, link; sm and md; icon |
| Tabs | selected | 3 copies with different CSS | role=tab | 6/10 | 9/10: one `.tab` style for panel, editor and chat tabs |
| Callout | n/a | `.card`, `.notice` (two names, one job) | none | 4/10 | 9/10: one `.callout` with `data-tone` info, warn, error, success; errors get `role=alert` |
| Status dot | ad hoc glyphs (◐ rendered badly) | n/a | none | 3/10 | 9/10: `.dot[data-state]` idle, working (pulses), needs-you, done, error; respects reduced motion |
| Task card | n/a | n/a | `role=button` hid its inner buttons | n/a | 9/10: plain container, title is a real button |

Score: **62/100 before, 90/100 after.**

What's left: no light/dark auto-switching from the OS, no keyboard arrow
navigation inside tab lists, and the file tree isn't a full ARIA tree
(it has roles but no arrow-key movement).

## Typography review, 2026-10-16

| Where | Before, Windows | Before, macOS | Problem |
|---|---|---|---|
| Interface | Segoe UI | SF Pro | Different widths: labels truncate differently on each OS |
| Code (editor, terminal) | Cascadia Code if present, else Consolas | Menlo (Chromium ignores `ui-monospace` and can't use SF Mono) | Two different code fonts; Consolas reads small at 13px |
| Ligatures | none | none | No choice |
| Updating numbers | proportional | proportional | Memory figures jitter |
| Dark themes | n/a | heavy subpixel text | VS Code thins it with antialiasing |

Decision: ship **Inter** (UI) and **JetBrains Mono** (code) as variable fonts,
48 KB and 40 KB for Latin, loaded per script range. Both OFL-licensed. The
same fonts on both machines means the same layout. "System" remains a
choice. Code size (10–22px, default 13, line height 1.55×) and ligatures
(default off, applied in the editor, terminal and any code in the interface)
are settings with a live preview. Status bar and badges use tabular figures.
macOS dark themes get `-webkit-font-smoothing: antialiased`.

## Tokens

### Color (per theme, `palettes.ts`)

| Token | Use |
|---|---|
| `bg` | Editor, terminal, inputs |
| `panel`, `panel-2` | Sidebars; raised surfaces such as buttons and callouts |
| `border` | All 1px lines |
| `text`, `muted` | Body text; secondary text (≥ 4.5:1 on every surface) |
| `accent` | Links, focus, selection, active tab underline |
| `accent-bg`, `accent-text` | Primary buttons, user chat bubble |
| `hover`, `active` | Row and button hover; selected row and pressed button |
| `code-bg` | Inline code, command output |
| `status-bg`, `status-text` | Status bar |
| `ok`, `warn`, `bad`, `error-bg` | Success, attention, failure, error banner |
| `review-bar` | Diff review header |
| `shadow-color`, `scrim` | Overlay shadows; backdrop behind dialogs |

The same palette drives Monaco (`themes.ts → monacoTheme`), including bracket
pair colors and diff colors, and xterm.js (`terminalTheme`): ANSI red is
`bad`, green `ok`, blue `accent`, and so on. That's what keeps the editor and
the terminal matching the app chrome.

### Scale (theme-independent, `:root`)

| Group | Tokens |
|---|---|
| Spacing | `--space-1` 2px, `-2` 4, `-3` 6, `-4` 8, `-5` 12, `-6` 16, `-7` 24, `-8` 32 |
| Type | `--text-xs` 11px, `-sm` 12, `-md` 13 (base), `-lg` 15, `-xl` 22; `--leading` 1.5; `--weight-strong` 600 |
| Fonts | `--font-ui` Inter, then system UI; `--font-mono` JetBrains Mono, then Cascadia Code, Menlo, Consolas (set by `appearance.ts`) |
| Radius | `--radius-sm` 3, `-md` 5, `-lg` 8, `-pill` |
| Elevation | `--shadow-1` (toasts), `--shadow-2` (palette, dialogs, lightbox) |
| Motion | `--duration-fast` 120ms, `--ease`; everything off under `prefers-reduced-motion` |
| Controls | `--control-sm` 22px, `--control-md` 28px |

## Components

### Button

`<button>` alone is the secondary button. Add classes for the rest.

| Class | Use when |
|---|---|
| `primary` | The one main action in a view: Send, Accept, Run, Start, Commit |
| (none) | Everything else |
| `danger` | Refusing or destroying: Reject, Deny, Stop, Remove |
| `ghost` | Toolbar and icon buttons |
| `link` | Inline, text-only (status bar) |
| `sm` | Inside dense rows: review bar, callouts, command rows |
| `icon` | Square, icon only. Use `IconButton`, which requires a label |

States: hover, active (pressed), `disabled` (45% opacity, not-allowed cursor),
`:focus-visible` ring in `accent`.

Do: one `primary` per area. Don't: use `primary` for a destructive action.

### Tabs

`.tabs` container with `role=tablist`, `.tab` buttons with `role=tab` and
`aria-selected`. The selected tab gets an `accent` underline. Optional `.end`
area for tools (e.g. the Center/Side switch).

### Callout

`<Callout tone title>` (`ui.tsx`). Tones: `info` (accent), `warn`
(permission requests), `error` (failures, `role=alert`), `success` (changed
files). Put buttons inside `.actions`.

### Status dot

`<span class="dot" data-state="idle|working|needs-you|done|error">`. Used for
tool calls, plan steps, tasks and busy chats, so a state looks the same
everywhere.

### Badge, tag, kbd

`.badge` is a count (`data-tone="warn"` when something waits for you).
`.tag` is a small label (tool kind, agent name). `<kbd>` shows shortcuts.

### Pane header

`<PaneHeader title>`: the one title row for sidebar views, uppercase
`--text-xs`, with optional actions on the right.

### Overlays

Palette (`palette.tsx`): quick open and command palette, arrow keys + Enter
+ Escape, `role=listbox`. Dialog (`settingsDialog.tsx`): `role=dialog`,
`aria-modal`, Escape closes. Toasts (`toast(text, tone)`): short feedback,
errors stay 8s, others 4s.

## Adding a theme

1. Copy a theme object in `palettes.ts` and change the values.
2. Run `npm test`: the contrast test checks every text pairing and every
   syntax color against the editor background.
3. It appears in the status-bar picker, Settings and the command palette.
