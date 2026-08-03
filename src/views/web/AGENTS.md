<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-04-01 -->

# web

## Purpose
Public-facing web page EJS templates.

## Key Files

| File | Description |
|------|-------------|
| `faq.ejs` | FAQ page |
| `tos.ejs` | Terms of Service |
| `privacy.ejs` | Privacy Policy |

## For AI Agents

### Working In This Directory
- Rendered via Fastify routes in `src/routes/web/` (`pages.ts`, `finance.ts`)
- Landing page (`GET /`) is served from the React SPA build at `admin-ui/dist/index.html` (see root AGENTS.md Prioritas #6); `landing.ejs` deleted 2026-08-03
- No authentication required for these pages

<!-- MANUAL: -->
<!-- MANUAL 2026-08-03: landing.ejs & app.ejs rows dropped (both deleted; landing is now React SPA from admin-ui/dist); Key Files = faq/tos/privacy only; route pointer updated to src/routes/web/ -->
