# Responsive Design Rules — ALWAYS FOLLOW

## Core Principle
**ZERO static pixel sizes.** Every dimension, font, padding, margin, gap, border-radius MUST scale with the viewport.

## CSS Variables Pattern

```css
:root {
  /* Font sizes — clamp(min, preferred, max) */
  --fs-xs:  clamp(.65rem, .6rem + .3vw, .75rem);
  --fs-sm:  clamp(.7rem, .65rem + .35vw, .8rem);
  --fs-base: clamp(.8rem, .75rem + .35vw, .9rem);
  --fs-md:  clamp(.85rem, .8rem + .4vw, 1rem);
  --fs-lg:  clamp(1rem, .9rem + .6vw, 1.25rem);
  --fs-xl:  clamp(1.2rem, 1rem + 1vw, 1.6rem);
  --fs-2xl: clamp(1.4rem, 1.1rem + 1.5vw, 2rem);
  --fs-3xl: clamp(1.8rem, 1.4rem + 2vw, 2.6rem);

  /* Spacing — scale with viewport */
  --sp-xs: clamp(4px, .4vw, 8px);
  --sp-sm: clamp(8px, .8vw, 14px);
  --sp-md: clamp(12px, 1.2vw, 20px);
  --sp-lg: clamp(16px, 1.6vw, 28px);
  --sp-xl: clamp(20px, 2vw, 36px);

  /* Base font scales with screen */
  --sidebar-w: clamp(180px, 15vw, 240px);
}

html { font-size: clamp(14px, 1vw + 12px, 16px) }
```

## Rules

1. **Font sizes** → use `var(--fs-*)` or `clamp()`, NEVER raw `px`
2. **Padding/margin/gap** → use `var(--sp-*)` or `clamp()`, NEVER raw `px`
3. **Widths** → use `%`, `vw`, `fr`, or `clamp()`. NEVER fixed `px` width
4. **Heights** → use `vh`, `dvh`, `%`, or `clamp()`. NEVER fixed `px` height
5. **Border-radius** → use `clamp()` or `rem`. NEVER raw `px`
6. **Grid columns** → use `minmax(min(Xpx, 100%), 1fr)` to prevent overflow
7. **Viewport** → always `max-width: 100vw; overflow-x: hidden` on html/body
8. **Images/video** → always `max-width: 100%; height: auto`
9. **Inputs/buttons** → always `max-width: 100%`
10. **Inline styles with max-width** → override with `!important` in media queries

## Breakpoints

```css
@media(max-width:1024px) { /* tablet */ }
@media(max-width:768px)  { /* mobile — hide sidebar, show bottom nav */ }
@media(max-width:480px)  { /* small mobile — single column */ }
@media(max-width:380px)  { /* tiny — tightest padding */ }
```

## Mobile Checklist

- [ ] Sidebar → hidden, bottom nav visible
- [ ] All grids → 1 column on ≤480px
- [ ] Inline `max-width` → overridden to 100%
- [ ] Tables → hide non-essential columns or horizontal scroll
- [ ] Padding-bottom → account for bottom nav (clamp 80-100px)
- [ ] `100dvh` for dynamic viewport height (mobile browser chrome)

## NEVER DO

- ❌ `font-size: 14px` — use `var(--fs-base)` or `clamp()`
- ❌ `padding: 16px` — use `var(--sp-md)` or `clamp()`
- ❌ `width: 300px` — use `%` or `clamp()`
- ❌ `max-width: 400px` inline — will break on mobile
- ❌ `height: 100vh` alone — use `100vh; min-height: 100dvh`
- ❌ `grid-template-columns: repeat(3, 200px)` — use `minmax(min(200px, 100%), 1fr)`
