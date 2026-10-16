# FriedLiver design system

One stylesheet (`src/renderer/styles.css`) and one palette file
(`src/renderer/palettes.ts`). Components use tokens only: no raw colors, sizes
or spacing outside the token block. `test/palettes.test.ts` fails the build if
any theme drops below WCAG AA contrast, including the tinted surfaces the
stylesheet derives with `color-mix`.

## Redesign, 2026-10-16

The first pass made the system consistent. This one makes it calm and
agent-first: quiet chrome, the agent loop (who is working, what it changed,
what waits for you) as the loudest thing on screen, and motion that says
what state something is in. Measured on the same 1440×900 tour
(`scripts/ui-tour.mjs`), every theme.

| Area | Before | After |
|---|---|---|
| Chrome | Saturated status bar, 5px splitter, borders on every edge, two "selected" bars in the activity bar | Status bar in the panel color with icons; 1px splitter with a 9px grab area; softer hairlines (`--line-soft`); only the sidebar view gets the selected bar, toggles just light up |
| Header rows | 32, 34 and 52px rows that didn't line up across columns | One `--header-h` (38px) for pane headers, tabs, the review bar and the agent tabs |
| Agent panel | Three stacked header rows (panel tabs, full-width agent select, chat tabs) | Two: panel tabs, then one row with the chats (agent mark, short name, busy dot) and a compact agent picker with +. The open chat scrolls into view; cut edges fade |
| First chat | A line of text in the corner | Agent cards (Claude, GPT, Gemini, Demo) and one-click "Take the tour" / "Build a project" |
| Transcript | Every item the same weight | Each agent turn opens with its mark and name; consecutive tool calls share one card with status icons; the plan shows progress (`2 of 5 done`) instead of strike-through; inline code in notices; a spinner and shimmer while the agent works |
| Composer | Textarea plus a hint line under every chat | One rounded box that grows with the message: agent, attach images, send (↑) or Stop; the key hint hides in narrow columns |
| Review | Small bar, filename truncated first | Shield mark, file icon, Reject then Accept with `Ctrl/⌘+Enter`; the filename never truncates before the hint |
| Commands | Plain rows, terminals before approvals | Approvals tab first; cards with a state dot; waiting commands glow `warn` |
| File tree, tabs, search, git | Unicode chevrons, no file icons, raw match lines | SVG chevrons that rotate, file-type icons tinted from the theme's syntax colors, indent guides, matches highlighted, name then folder |
| Palette | Text list | Icons and agent marks, shortcuts as keycaps, file name then folder, footer with keys and the result count |
| Settings | One long form | Section nav that follows the scroll; themes as preview cards; accounts and keys as card lists with agent marks |
| Empty states | Plain text | Welcome with the logo and agents; the empty editor shows a faint logo and the five shortcuts that matter |
| Motion | Pulse only | Overlays pop in, transcript items and toasts rise, spinners and shimmer; all of it off under `prefers-reduced-motion` |

Still open: no light/dark auto-switching from the OS, no arrow keys inside
tab lists and the file tree (both in `docs/parking-lot.md`).

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

`applyTheme` also sets the syntax colors as `--syntax-*` (`--syntax-type`,
`--syntax-string`…), so file icons follow the editor's palette.

### Derived (`:root`, from the theme with `color-mix`)

| Token | Use |
|---|---|
| `--line-soft` | Hairlines between regions and inside cards (65% `border`) |
| `--raised` | Cards on a panel: agent cards, tasks, account and key lists |
| `--accent-soft`, `--accent-line` | Selected tree row and activity view; focused field border |
| `--muted-on-active` | Secondary text on a selected (`active`) row, kept at 4.5:1 |
| `--highlight` | 1px inner top light on buttons and overlays |
| `--agent-claude`, `-codex`, `-gemini`, `-demo` | Each agent's mark color; darker values for light themes |

The same palette drives Monaco (`themes.ts → monacoTheme`), including bracket
pair colors and diff colors, and xterm.js (`terminalTheme`): ANSI red is
`bad`, green `ok`, blue `accent`, and so on. That's what keeps the editor and
the terminal matching the app chrome.

### Scale (theme-independent, `:root`)

| Group | Tokens |
|---|---|
| Spacing | `--space-1` 2px, `-2` 4, `-3` 6, `-4` 8, `-5` 12, `-6` 16, `-7` 24, `-8` 32, `-9` 48 |
| Type | `--text-xs` 11px, `-sm` 12, `-md` 13 (base), `-lg` 15, `-xl` 22, `-2xl` 30 (welcome); `--leading` 1.5, `--leading-prose` 1.62 (agent replies); `--weight-medium` 500, `--weight-strong` 600; `--tracking-tight`, `-display`, `-caps` |
| Fonts | `--font-ui` Inter, then system UI; `--font-mono` JetBrains Mono, then Cascadia Code, Menlo, Consolas (set by `appearance.ts`) |
| Radius | `--radius-sm` 4, `-md` 6, `-lg` 10 (cards), `-xl` 14 (composer, overlays), `-pill` |
| Elevation | `--shadow-0` (buttons, composer), `--shadow-1` (toasts), `--shadow-2` (palette, dialogs, lightbox); `--ring` (focus), `--glow` (focused field) |
| Motion | `--duration-fast` 120ms, `--duration-med` 220ms; `--ease`, `--ease-out`; keyframes `rise`, `pop-in`, `toast-in`, `spin`, `shimmer`; everything off under `prefers-reduced-motion` |
| Controls | `--control-sm` 24px, `--control-md` 30px, `--control-lg` 38px; `--header-h` 38px; `--row-h` 24px |

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
| `lg` | The one call to action on an empty screen (Open folder) |
| `icon` | Square, icon only. Use `IconButton`, which requires a label |

States: hover, active (pressed), `disabled` (45% opacity, not-allowed cursor),
`:focus-visible` 2px `--ring`. Icons go before the label. In a pair, the
refusal comes first and the primary action last: Reject, Accept; Deny, Run.

Do: one `primary` per area. Don't: use `primary` for a destructive action.

### Tabs

`.tabs` container with `role=tablist`, `.tab` buttons with `role=tab` and
`aria-selected`, `--header-h` tall. The selected tab gets a 2px `accent`
underline; editor tabs put it on top and open into the editor below. Optional
`.end` area for tools (e.g. the Center/Side switch). Chats use `.chat-tab`,
a raised pill with the agent mark, because they sit in a row with other
controls.

### Callout

`<Callout tone title icon>` (`ui.tsx`): a tone icon, then the body, on a 6%
tint of the tone with a matching border. Tones: `info` (accent), `warn`
(permission requests), `error` (failures, `role=alert`), `success` (changed
files). Put buttons inside `.actions`; in an error, the first action is
primary. Toasts are callouts too.

### Status dot

`<span class="dot" data-state="idle|working|needs-you|done|error">`. Used for
tasks, commands, accounts and busy chats, so a state looks the same
everywhere. Tool calls and plan steps use the larger status icon in
`chat.tsx` (check, spinner, alert, empty circle) with the same states.
`.pill[data-state]` is a dot with a label (task status).

### Agent mark, file icon

`<AgentMark agent size>` (`icons.tsx`): the agent's glyph in its
`--agent-*` color on a tinted tile, at `sm` 16, `md` 20, `lg` 32. It goes
wherever an agent is named: chat tabs, turn headers, tasks, accounts, the
composer, the palette. `<FileIcon name>` tints a file glyph from the theme's
syntax colors by extension.

### Keys

`<Keys keys="Ctrl+Shift+P" />` draws each key as a `<kbd>`. Use it for every
shortcut shown in the interface.

### Badge, tag, kbd

`.badge` is a count (`data-tone="warn"` when something waits for you).
`.tag` is a small label (tool kind, agent name). `<kbd>` shows shortcuts.

### Pane header

`<PaneHeader title>`: the one title row for sidebar views, uppercase
`--text-xs`, with optional actions on the right.

### Overlays

Palette (`palette.tsx`): quick open and command palette, arrow keys + Enter
+ Escape, `role=listbox`; items take an `icon` or `agent`, files show name
then folder. Dialog (`settingsDialog.tsx`): `role=dialog`, `aria-modal`,
Escape closes; Settings has a section nav that follows the scroll. Toasts
(`toast(text, tone)`): short feedback, errors stay 8s, others 4s. All
overlays sit on a blurred `scrim` and pop in.

## Adding a theme

1. Copy a theme object in `palettes.ts` and change the values.
2. Run `npm test`: the contrast test checks every text pairing and every
   syntax color against the editor background.
3. It appears in the status-bar picker, Settings and the command palette.
