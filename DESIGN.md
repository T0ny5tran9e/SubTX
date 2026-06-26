# Design System: SubTX
**Project:** Chrome Extension (Manifest V3)

---

## Configuration — Design Dials

| Dial | Level | How It Applies |
|------|-------|----------------|
| **Creativity** | `7` | Terminal-inspired but not generic — the lime-on-mirage palette is distinctive, the neon title effect is a signature. Functional creativity through developer-tool identity. |
| **Density** | `6` | Compact tool interface with accessible spacing. Every pixel serves a purpose — no decorative fluff, no wasted chrome. Cockpit-dense for power users but with visual breathing room. |
| **Variance** | `3` | Predictable, systematic layout. Power tools benefit from consistent muscle memory — buttons, filters, and controls stay where users expect them. |
| **Motion Intent** | `3` | Sub-second micro-transitions on hover/focus only. No cinematic animation — the interface responds, it does not perform. Speed over spectacle. |

---

## 1. Visual Theme & Atmosphere

SubTX is a **terminal-inspired power tool** — a dark, focused interface that evokes a developer's command line brought into the browser extension context. The atmosphere is **functional and intentional**, like a well-organized `.tmux.conf` or a thoughtfully configured Neovim session. Lime green on deep mirage blue references the classic green-on-black terminal aesthetic but with modern refinement: the green is calibrated to be readable without being harsh, and the blue backgrounds add depth without losing the dark-terminal soul.

The interface is **dense but not cluttered** — every control, every label, every pixel earns its place through utility. There is no decorative imagery, no illustration, no marketing copy. This is a cockpit for URL wrangling: buttons are labeled with command-like brevity ("Get Tabs", "Open URLs", "Extract URLs from text"), and the visual hierarchy is flat and immediate. The neon glow on the title is the single decorative gesture — a signature that says "this is a tool with identity" without compromising the utilitarian core.

**Key Characteristics:**
- Dark-terminal fidelity with modern color refinement (no true black, calibrated contrast)
- Monospace-only typography — every character, label, and counter uses `JetBrains Mono`
- Flat, immediate visual hierarchy — no decorative depth, no illustration
- Neon accent glow as the single signature flourish
- Predictable, systematic layout for muscle-memory efficiency
- High contrast for readability in any lighting environment

---

## 2. Color Palette & Roles

### Surface & Background
- **Mirage Blue** (`#141D2B`) — Primary background. The canvas for all content. Deep enough to provide terminal-dark atmosphere, blue enough to avoid sterile black.
- **Deep Panel** (`#1A2332`) — Container/card background. Used for the main popup container, providing subtle layering against the Mirage Blue body. One step lighter for visual separation.
- **Textarea Surface** (`#232B3B`) — Textarea and input field backgrounds. Lightest of the dark surfaces, providing a visual "active area" cue for the primary data entry zone.

### Accent (Single — Lime Green)
- **Terminal Lime** (`#9FEF00`) — The single accent color. Used for all interactive text, borders, focus indicators, buttons (default state), status backgrounds, scrollbar thumbs, and the neon title glow. This is the voice of the interface — unmistakable, highly legible on dark, and associated with the terminal/developer tool identity. Saturation ~85%, never crossing into neon purple or oversaturated territory.

### Typography Hierarchy
- **Phosphor White** (`#F8F8F2`) — Primary body text. Light text on dark backgrounds — the terminal "output" color. Used for URLs in the textarea, status messages, and button labels.
- **Muted Steel** (`#444444`) — Border lines, dividers, structural separators. Recessive enough to create visual structure without competing with content.

### Functional States
- **Signal Cyan** (`#00BFFF`) — Success messages, informational status, and the outer ring of the neon title glow. Assists the accent without competing — cyan is a natural partner to lime on dark blue.
- **Gold Alert** (`#FFD700`) — Warning messages. Warm contrast against the cool blue background.
- **Error Red** (`#FF5555`) — Error messages, danger states, validation failures. Classic terminal error red — never pink, never orange-rust.

### Banned Colors
- Pure black (`#000000`) — always use Mirage Blue or Deep Panel
- Purple/violet neon gradients — the "AI Purple" aesthetic has no place in a terminal tool
- Oversaturated accents above 85% saturation
- Warm grays or beige tones — incompatible with the dark terminal aesthetic
- Mixed warm/cool gray systems — stick to cool blue-neutrals

---

## 3. Typography Rules

**Typeface:** `JetBrains Mono` — chosen for its distinctive coding ligatures, clear glyph differentiation (`0` vs `O`, `1` vs `l` vs `I`), and strong terminal/developer tool identity. This is the only typeface in the system — no sans-serif body, no serif headlines.

### Hierarchy
- **Product Title (H1):** `JetBrains Mono` — Weight 500, `1.4em`, letter-spacing `0.8px`. The neon-signed brand mark. Appears once at the top of the popup.
- **Body & Labels:** `JetBrains Mono` — Weight 400, `0.92em–0.95em`. All button text, labels, filter inputs, and status messages.
- **URL Display (Textarea):** `JetBrains Mono` — Weight 400, `0.95em`, line-height `1.35`. The primary data surface. Monospace ensures URL alignment and scannability.
- **Metadata/Counters:** `JetBrains Mono` — Weight 400, `0.85em`. URL counters, validity breakdowns, badge text. Small but fully legible — never below `0.85em`.
- **Filter Input:** `JetBrains Mono` — Weight 400, `0.92em`. Dropdown select, text input, and filter keywords.

### Scale
- All font sizes stay within `0.85em – 1.4em` — the popup is compact by design
- No `clamp()` needed — popup dimensions are fixed-width (540px)
- Minimum body size: `0.85em` (~14px scaled) — accessible, never below

### Banned Fonts
- `Inter` — inappropriate for a terminal tool (not a monospace; wrong genre)
- Any serif font (`Times New Roman`, `Georgia`, `Garamond`) — serif has no place in a developer tool dashboard
- System UI fonts (`-apple-system`, `Segoe UI`, `Roboto`) — would break the terminal illusion
- `Comic Sans`, `Papyrus`, or any decorative/non-programming typeface

---

## 4. Component Stylings

### Buttons
- **Shape:** Subtly rounded corners (`8px` / `0.5rem`). Modern without being playful.
- **Default:** Mirage Blue (`#141D2B`) background, Terminal Lime (`#9FEF00`) border and text. Flat, no shadow, no glow.
- **Hover:** Background fills with Terminal Lime (`#9FEF00`), text inverts to Mirage Blue (`#141D2B`). Subtle dual-tone glow appears: `0 0 8px var(--accent), 0 0 12px #00BFFF`. This is the single interaction flourish — a brief, controlled glow that signals clickability.
- **Active:** `translateY(1px)` — tactile micro-press feedback.
- **Focus-visible:** `2px solid Terminal Lime` outline, `2px` offset. High-contrast for keyboard navigation.
- **Disabled:** Opacity `0.4`, no pointer events, no shadow. Fades into background.
- **Min Height:** `44px` (WCAG touch target compliance).
- **Padding:** `12px 16px` — comfortable without wasting space.

### Buttons (Top Action Row — "Paste", "Get Tabs", "Page Links", "Visual Select")
- Same shape and interaction model as standard buttons.
- Arranged in a centered, inline-flex row with `8px` gap.
- Flex-grow is disabled — buttons take their natural width, avoiding uneven stretching.

### Textarea
- **Shape:** `8px` border radius, matching button consistency.
- **Default:** Textarea Surface (`#232B3B`) background, Phosphor White (`#F8F8F2`) text, Muted Steel (`#444`) border.
- **Hover:** Scrollbar thumb brightens to `#cfff33` (lighter lime). Border stays Muted Steel.
- **Focus:** Terminal Lime (`#9FEF00`) border, success inset shadow, `2px` outline offset. The textarea is the primary workspace — focus state is unmistakable.
- **Min Height:** `200px`, resizable vertically.
- **Scrollbar (WebKit):** Dark gradient track, Terminal Lime thumb with `3px` transparent border (creates a thin, floating scrollbar). Hover brightens thumb to `#cfff33`.
- **Scrollbar (Firefox):** `thin` width, Terminal Lime thumb on Textarea Surface track.

### Inputs & Select
- **Shape:** `8px` border radius, matching buttons and textarea.
- **Default:** Mirage Blue (`#141D2B`) background, Terminal Lime (`#9FEF00`) text and border, `JetBrains Mono` font.
- **Hover:** Subtle lime tint (`rgba(159,239,0,0.12)`) on background, accent border maintained.
- **Focus:** Background inverts to Terminal Lime, text to Mirage Blue, border shifts to Signal Cyan (`#00BFFF`). Clear, unmistakable active state.
- **Labels:** Positioned above the input. No floating labels — standard `8px` gap between label and input.

### Checkbox
- **Accent:** Terminal Lime (`#9FEF00`) via `accent-color`.
- **Label:** Terminal Lime text, `0.95em`, placed inline after the checkbox.
- **Disabled:** Opacity `0.6`.

### Filter Container
- Two-row layout: **Row 1** has the dropdown select + keyword input side by side. **Row 2** has "Apply Filter" and "Reset Filter" buttons centered.
- **Preview Badge:** Shows match counts during live filter preview. Lime-tinted background (`rgba(159,239,0,0.08)`), Terminal Lime border, `0.85em` small text. Appears inline, never as a popup or tooltip.

### Status Area
- `role="status"` + `aria-live="polite"` — screen-reader friendly.
- Lime-tinted background (`rgba(159,239,0,0.22)`) with semi-transparent lime border.
- Phosphor White text, `0.85em`, `6px` border radius.
- Auto-hides via `[hidden]` attribute — never takes space when empty.
- Messages auto-clear after 2–4 seconds (longer for errors).

### Loaders / Spinners
- **Not used.** Buttons show their loading state via `withLoading()` which disables the button and shows a status message. No circular spinner, no skeletal shimmer — in a compact popup, a status message is more informative and less distracting.

### Empty States
- Textarea placeholder: `"Paste URLs here or enter manually..."` — clear, instructional, never just "No data."
- Context actions (`#contextActions`) hidden via `aria-hidden="true"` when textarea is empty — the interface intelligently reveals controls only when there is content to act on.

### Error States
- Error messages appear inline in the status area with Error Red (`#FF5555`) tint.
- `friendlyError()` maps raw Chrome API errors to human-readable messages — a user should never see `"Error: chrome.runtime.lastError"`.
- Clipboard errors include fallback instructions and permission-request flows.

---

## 5. Hero / Title Section

SubTX's title is the single decorative element in the interface:
- **Text:** "SubTX" in Terminal Lime (`#9FEF00`), `1.4em`, `JetBrains Mono`, letter-spacing `0.8px`.
- **Neon Glow Effect:** Layered `text-shadow` creating a terminal-CRT-inspired aura:
  - `0 0 5px var(--accent)` — inner glow
  - `0 0 10px var(--accent)` — mid glow
  - `0 0 20px var(--accent)` — outer glow
  - `0 0 40px #00BFFF` — blue outer aura (Signal Cyan)
- **Behavior:** Static — no animation, no pulse, no fade. The glow is always present. It is the brand signature, not an interaction cue.
- **No images, no inline media, no decorative graphics.** The title is pure typography with light — appropriate for a terminal tool.

---

## 6. Layout Principles

### Grid & Structure
- **Container:** Fixed `540px` width, `14px` padding, `500px` min-height. The popup is a tool card, not a full-page app — fixed dimensions ensure predictable display.
- **Layout Model:** Flexbox column. Elements stack top-to-bottom: Title → Checkbox → Top Buttons → Textarea → Context Actions → Status.
- **Textarea:** `flex: 1` — absorbs remaining vertical space, ensuring action buttons stay at the bottom.

### Spacing
- **Base Unit:** `8px` — used for consistent gaps between all elements.
- **Internal Padding:** `14px` container, `12px` for buttons/inputs, `12px` textarea padding.
- **Vertical Rhythm:** `8px` gaps between rows, `10px` margin on textarea, `12px` above status.
- **No excess whitespace** — this is a density-optimized tool. Every pixel is intentional.

### Responsive Behavior
- **420px breakpoint:** Container shrinks to `420px`. Buttons, filter rows, and action rows wrap. Preview badge goes full-width.
- **360px breakpoint:** Container goes full-width (`100%`, min `360px`). Title shrinks to `1.2em`. Buttons go full-width. Min-height becomes `100vh` for mobile popup use.
- **No horizontal scroll** at any breakpoint. Elements wrap or collapse.
- **Touch targets:** All interactive elements minimum `44px` height at all breakpoints.

### Banned Layouts
- No 3-column equal card grids (irrelevant for a popup tool but enforced in spirit)
- No overlapping elements — every control occupies its own clear zone
- No `calc()` percentage hacks — flexbox gap handles distribution

---

## 7. Motion & Interaction

### Philosophy
Motion in SubTX is **minimal and purposeful**. The popup is a tool — animations serve to confirm interaction, not to entertain. Every transition is sub-second and subtle.

### Physics & Timing
- **Default Transition:** `0.12s` — fast enough to feel responsive, slow enough to perceive. Used for button hover/focus, input focus, border shifts, background fills.
- **Button Active:** `0.08s` — immediate tactile feedback on click.
- **No spring physics** — the popup is a compact tool, not a premium marketing site. Simple cubic-bezier or linear timing is appropriate for utility UI.
- **No staggered reveals** — lists and content appear instantly. In a tool, delay is friction.

### Micro-Interactions
- **Button Hover:** Background fills with accent, text inverts, subtle glow appears (`0.12s`).
- **Button Active:** `translateY(1px)` press (`0.08s`).
- **Input Focus:** Background and text color swap (`0.12s`).
- **Scrollbar Hover:** Thumb brightens (`0.12s`).
- **Status Message:** Auto-clears after 2–4s with instant removal (no fade-out — status updates are announcements, not transitions).
- **No perpetual micro-loops** — no pulsing dots, no floating icons, no typewriter effects. The interface is still unless interacted with.

### Performance Rules
- Animate only `background`, `color`, `border`, `box-shadow`, `transform` — never `width`, `height`, `top`, `left`.
- All transitions GPU-accelerated where possible.

---

## 8. Accessibility

### Contrast & Color
- **Lime on Mirage Blue:** ~7:1 contrast ratio — exceeds WCAG AA for normal text.
- **Phosphor White on Textarea Surface:** ~8:1 contrast.
- **Error Red on Mirage Blue:** ~5:1 — meets WCAG AA for large text.

### Keyboard Navigation
- All buttons focusable with sequential tab order.
- Enter in filter input triggers "Apply Filter" — no mouse required for primary workflow.
- `focus-visible` outlines on all interactive elements — visible only for keyboard users, not mouse users.

### ARIA
- `role="status"` + `aria-live="polite"` on status div — screen readers announce updates.
- `aria-label` on all interactive elements: buttons, textarea, filter controls, checkbox.
- `aria-hidden="true"` on context actions when textarea is empty — screen readers skip invisible controls.
- `aria-label="SubTX URL Manager"` on main container.

### Touch & Target Size
- All buttons minimum `44px` height (WCAG 2.5.5).
- `8px` gaps between adjacent interactive elements prevent mis-taps.

---

## 9. Anti-Patterns (Banned)

- **No emojis** — anywhere in the UI, code, or labels.
- **No serif fonts** — `Times New Roman`, `Georgia`, `Garamond` have no place in a terminal tool.
- **No `Inter`** — this is a monospace tool; Inter's proportional spacing would break the terminal illusion.
- **No pure black** (`#000000`) — all dark surfaces use Mirage Blue, Deep Panel, or Textarea Surface.
- **No purple/violet neon** — the "AI Purple" aesthetic is banned. Lime + cyan only.
- **No oversaturated accents** — Terminal Lime stays below 85% saturation.
- **No circular loading spinners** — status messages replace spinners.
- **No overlapping elements** — clean flexbox stacking, no `position: absolute` for layout.
- **No fake data or metrics** — SubTX displays real tab URLs and real counters. No fabricated statistics.
- **No AI copywriting clichés** — "Elevate", "Seamless", "Unleash", "Next-Gen" are banned. Labels are commands: "Get Tabs", "Open URLs", "Apply Filter".
- **No filler UI text** — no "Scroll to explore", no bouncing chevrons, no instructional overlays.
- **No decorative imagery** — no illustrations, no icons beyond the extension icon, no brand graphics.
- **No `h-screen`** — use `min-height` for container sizing.
- **No custom mouse cursors** — the content script overlay uses `crosshair` during drag-select (functional, not decorative), but the popup itself never changes the cursor from default/pointer.
- **No broken image links** — no Unsplash, no external image dependencies.

---

## 10. Design System Notes for Implementation

### Language to Use
- **Atmosphere:** "Terminal-inspired power tool, dark and focused, lime-on-mirage aesthetic"
- **Button Shapes:** "Subtly rounded corners (8px)" — not `rounded-lg` or `border-radius: 8px`
- **Glow Effect:** "Controlled neon glow on title, subtle lime-and-cyan aura" — not `text-shadow`
- **Spacing:** "Purposeful 8px grid" — not `gap-2`
- **Typography:** "JetBrains Mono throughout" — not `font-mono`

### Color References
- Background: "Mirage Blue (#141D2B)"
- Accent: "Terminal Lime (#9FEF00)"
- Text: "Phosphor White (#F8F8F2)"
- Success: "Signal Cyan (#00BFFF)"
- Error: "Error Red (#FF5555)"
- Warning: "Gold Alert (#FFD700)"

### Component Prompts
- "Create a popup container with Deep Panel background, 10px border radius, and subtle box-shadow"
- "Design a button with Mirage Blue fill, Terminal Lime border, 8px radius — on hover, fill inverts to lime with a controlled dual-tone glow"
- "Add a textarea with Textarea Surface background, Muted Steel border, and a customized lime scrollbar"
- "Build a filter row with a dropdown select and keyword input, both inverting to lime on focus"
