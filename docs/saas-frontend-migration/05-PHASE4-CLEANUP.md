# Phase 4: Cleanup & Deprecation

> **Goal:** Remove all EJS templates, EJS npm dependency, and legacy code
> **Estimated effort:** 2-4 agent-hours
> **Dependencies:** All phases 1-3 must be complete
> **Risk:** 🟢 LOW

---

## Task Breakdown

### T48 — Remove EJS Dependency
```
📋 Task: Remove EJS npm package
Commands: npm uninstall ejs @fastify/view
Files to modify:
  - package.json (remove ejs, @fastify/view)
  - tsconfig.json (if any EJS type stubs)
Estimated effort: 0.25h
Notes:
  - Keep EJS installed until ALL pages verified in React
  - Verify no other code imports ejs: grep -r "require.*ejs" src/
```

### T49 — Delete EJS View Files
```
📋 Task: Delete all EJS template files
Files to delete:
  src/views/
  ├── admin/             ← 35 files (incl. layout.ejs, sidebar.ejs)
  │   ├── *.ejs
  │   └── partials/
  ├── web/               ← 18 files (incl. 13 partials)
  │   ├── *.ejs
  │   └── partials/
  └── youtube/           ← 1 file (dashboard.ejs)
Total: ~54 files
Estimated effort: 0.25h
Notes:
  - Soft-delete: keep directory but empty it first
  - Remove only after verifying all routes redirect to React
  - grep for any remaining reply.view() calls first
```

### T50 — Remove reply.view() Calls
```
📋 Task: Replace all reply.view() with redirects
Target: All route files that still render EJS
Files to modify:
  - src/routes/admin.ts            ← admin dashboard EJS routes
  - src/routes/admin/content-tools.ts
  - src/routes/admin/pricing.ts
  - src/routes/admin/prompts.ts
  - src/routes/admin/fanpage.ts
  - src/routes/web.ts              ← web/public routes
  - src/routes/web/pages.ts        ← landing, FAQ, etc.
  - src/routes/api/youtube.ts      ← youtube dashboard

Replace pattern:
  // BEFORE
  return reply.view("admin/xxx.ejs", { ... });
  // AFTER
  return reply.redirect("/admin/react/xxx");
Estimated effort: 1h
```

### T51 — Simplify Sidebar Component
```
📋 Task: Remove "ejs" type from Sidebar
Files to modify:
  - admin-ui/src/components/Sidebar.tsx

Changes:
  - Remove `type: "ejs"` from all items (now all type: "react")
  - Simplify handleNav() — always use navigate(), never window.location.href
  - Remove external link icon for EJS items
  - Remove `type: "ejs" | "react"` union type

Estimated effort: 0.5h
```

### T52 — Remove EJS Layout Engine Code
```
📋 Task: Remove EJS scaffolding from server
Target locations:
  - src/index.ts                ← @fastify/view registration, engine config
  - src/routes/admin/shared.ts  ← EJS-related helpers
  - Any layout/partial loading code

Estimated effort: 0.5h
```

### T53 — Update AGENTS.md
```
📋 Task: Update architecture docs
Files to modify:
  - AGENTS.md (remove EJS references, update architecture description)

Estimated effort: 0.25h
```

---

## Files to Delete (Complete List)

```
src/views/
├── admin/
│   ├── ab-tests.ejs
│   ├── ai-config.ejs
│   ├── analytics.ejs
│   ├── autopilot.ejs
│   ├── bookshelf.ejs
│   ├── calendar.ejs
│   ├── captions.ejs
│   ├── carousel.ejs
│   ├── cloak.ejs
│   ├── comic.ejs
│   ├── dynamic-pricing.ejs
│   ├── engagement.ejs
│   ├── fanpage.ejs
│   ├── interceptions.ejs
│   ├── layout.ejs
│   ├── login.ejs
│   ├── looping.ejs
│   ├── medias.ejs
│   ├── movie.ejs
│   ├── music.ejs
│   ├── personas.ejs
│   ├── pinterest.ejs
│   ├── playground.ejs
│   ├── pricing.ejs
│   ├── prompts.ejs
│   ├── providers.ejs
│   ├── remeta.ejs
│   ├── render-ad.ejs
│   ├── repurpose.ejs
│   ├── research.ejs
│   ├── settings.ejs
│   ├── storyboard.ejs
│   ├── trending.ejs
│   ├── tts.ejs
│   ├── users.ejs
│   └── video-tools.ejs
├── web/
│   ├── app.ejs
│   ├── faq.ejs
│   ├── landing.ejs
│   ├── privacy.ejs
│   ├── tos.ejs
│   └── partials/
│       ├── create-wizard.ejs
│       ├── dashboard.ejs
│       ├── layout-chrome.ejs
│       ├── sidebar.ejs
│       ├── view-billing.ejs
│       ├── view-create.ejs
│       ├── view-image.ejs
│       ├── view-profile.ejs
│       ├── view-referral.ejs
│       ├── view-send.ejs
│       ├── view-settings.ejs
│       ├── view-subscription.ejs
│       └── view-videos.ejs
└── youtube/
    └── dashboard.ejs
```

---

## Verification Checklist

Before Phase 4 can be called complete:

```bash
# 1. No EJS files remain
find src/views -name "*.ejs" | wc -l
# Expected: 0

# 2. No reply.view() calls remain
grep -r "reply\.view" src/routes/ | wc -l
# Expected: 0 (or 0 if replaced with redirects)

# 3. EJS removed from dependencies
grep -c "ejs" package.json
# Expected: 0 (or only in devDependencies if still needed)

# 4. All admin routes redirect correctly
for route in $(cat 10-TRACKING.md | grep "Route:" | cut -d" " -f2); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$route")
  echo "$route → $code"
done
# Expected: All 302 (redirect) or 200 (if directly to React)

# 5. React SPA renders
curl -s http://localhost:3000/admin/react/dashboard | head -1
# Expected: <!DOCTYPE html> (React app loads)

# 6. Customer app renders
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/app/dashboard
# Expected: 200

# 7. Public pages render
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/faq
# Expected: 200

# 8. Build succeeds
cd admin-ui && npm run build
# Expected: exit code 0
```
