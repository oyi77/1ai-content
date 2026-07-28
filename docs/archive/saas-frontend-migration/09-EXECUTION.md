# Execution Workflow

> How agents pick up tasks, QA process, and PR flow.

---

## Agent Onboarding

When an agent starts a new task:

```bash
# 1. Pull latest code
cd /home/openclaw/projects/1ai-content
git pull origin master

# 2. Read plan docs
# Minimum required reading:
cat docs/saas-frontend-migration/01-ARCHITECTURE.md
cat docs/saas-frontend-migration/06-API-CONTRACTS.md
cat docs/saas-frontend-migration/07-COMPONENTS.md

# 3. Read your specific task
# e.g., cat docs/saas-frontend-migration/02-PHASE1-ADMIN.md
# and find your task (T01, T02, etc.)

# 4. Mark task as in_progress in tracking
# Update 10-TRACKING.md

# 5. Start implementation
```

---

## Implementation Flow Per Task

```
1. AUDIT
   ├── Read the current EJS template: src/views/admin/<page>.ejs
   ├── Understand what data it displays
   └── Check API endpoints in 06-API-CONTRACTS.md

2. CREATE
   ├── Create React component: admin-ui/src/pages/admin/<Page>.tsx
   ├── Use the correct pattern (A/B/C/D/Custom)
   ├── Handle all 4 states: loading, error, empty, success
   └── Use shared components from 07-COMPONENTS.md

3. WIRE
   ├── Add route to App.tsx
   ├── Update Sidebar type to "react"
   └── Add Fastify redirect in route file

4. VERIFY (self-test)
   ├── cd admin-ui && npm run build
   ├── curl localhost:3000/admin/react/<page> → 200
   ├── curl localhost:3000/admin/<page> → 302 (redirect)
   └── Check console errors (browser test)

5. COMMIT
   ├── git add -A
   ├── git commit -m "feat(admin): migrate <Page> to React SPA"
   └── Update 10-TRACKING.md with completed status
```

---

## Parallel Agent Execution

### How to parallelize without conflicts:

| Agent | Tasks | Files | Conflicts? |
|-------|-------|-------|------------|
| Agent 1 | T01-T11 (simple) | Different page files | None |
| Agent 2 | T01-T11 (simple) | Different page files | None |
| Agent 3 | T01-T11 (simple) | Different page files | None |
| Agent 4 | T12-T17 (CRUD) | + DataTable, FormField | None (DataTable created once) |
| Agent 5 | T18-T27 (medium) | More specific components | None |
| Agent 6 | T28-T33 (complex) | AI-specific code | None |

**Only conflict point:** Routes in `App.tsx` — coordinate or let one agent merge them.

### Recommended parallel plan:

```
Batch A (Day 1): 6 agents × 1-2 simple pages each
  → All simple pages done in parallel
  → Shared components (DataTable, FormField) created

Batch B (Day 2): 4 agents × 1-2 CRUD pages each
  → Uses DataTable from Batch A

Batch C (Day 2-3): 4 agents × medium pages
  → Uses shared components from Batch A

Batch D (Day 3-4): 2 agents × complex pages
  → Most complex, needs undivided attention
```

---

## Agent Communication Protocol

### When stuck:

```
1. Check existing patterns (look at a migrated page as example)
2. Search codebase for similar pattern: search_files(pattern, path)
3. If API endpoint missing → check 06-API-CONTRACTS.md
4. If still stuck → note in tracking as BLOCKED with reason
```

### When a shared component needs changes:

1. Make the change
2. Update `07-COMPONENTS.md` to reflect new API
3. Verify no existing usages break

### When done:

1. Run verification checklist
2. Update `10-TRACKING.md` with status
3. Commit with descriptive message

---

## QA Gates

### Per-Page Gate (agent self-check):

```bash
npm run build  # Must pass
curl http://localhost:3000/admin/react/<page>  # Must return 200
curl http://localhost:3000/admin/<page>  # Must return 302
```

### Batch Gate (before moving to next batch):

```bash
npm run test   # All existing tests must pass
npm run build  # Must pass
```

### Phase Gate (before declaring phase complete):

```
✅ All pages in batch built and verified
✅ All redirects working
✅ Sidebar updated
✅ No console errors
✅ Tracking updated
```

---

## Rollback for Broken Page

If a React page causes issues:

```ts
// In src/routes/admin/<sub>.ts
// Comment out the React redirect
// Uncomment the EJS render:
// return reply.view("admin/<page>.ejs", { ... });
```

This instantly restores the EJS version without downtime.
