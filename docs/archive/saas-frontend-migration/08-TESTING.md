# Testing Strategy

> What to test per page/phase and how.
> **Principle:** Every page must handle loading, error, empty, and success states.

---

## Per-Page Testing Checklist

Each page gets verified against these states:

```
POST /api/admin/pricing → {"success": true}
LOADING: spinner/ skeleton rendered while fetching
ERROR:   error message + retry button on 4xx/5xx/network failure
EMPTY:   "No items found" message when data array is empty
SUCCESS: data renders correctly with all fields shown
FORM:    validation on submit, success toast, error handling
REDIRECT: old EJS route redirects to React route
```

### Test Matrix (all pages)

| Page | Loading | Error | Empty | Success | Form | Redirect |
|------|---------|-------|-------|---------|------|----------|
| Captions | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Cloak | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Engagement | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Trending | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Calendar | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Looping | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Remeta | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Repurpose | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| TTS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Research | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Medias | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Fanpage | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Prompts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Interceptions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A/B Tests | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Personas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pricing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bookshelf | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Movie | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Video Tools | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Storyboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ad Renderer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Carousel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Music | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Channel Analysis | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Autopilot | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Playground | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Providers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI Config | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pinterest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dynamic Pricing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Verification Commands

### Quick smoke test (all routes respond):

```bash
# Admin routes → should redirect (302) or serve React (200)
for path in \
  /admin/pricing /admin/prompts /admin/fanpage /admin/interceptions \
  /admin/bookshelf /admin/comic /admin/movie /admin/captions \
  /admin/cloak /admin/engagement /admin/trending /admin/calendar \
  /admin/video-tools /admin/storyboard /admin/render-ad /admin/carousel \
  /admin/looping /admin/remeta /admin/repurpose /admin/tts \
  /admin/playground /admin/personas /admin/research /admin/medias \
  /admin/providers /admin/ai-config /admin/dynamic-pricing \
  /admin/analyze /admin/music /admin/autopilot /admin/pinterest \
  /admin/ab-tests /admin/settings; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$path" --max-time 5)
  if [ "$code" = "302" ] || [ "$code" = "301" ]; then
    location=$(curl -s -o /dev/null -w "%{redirect_url}" "http://localhost:3000$path" --max-time 5)
    echo "✅ $path → $code → $location"
  elif [ "$code" = "200" ]; then
    echo "✅ $path → $code (served)"
  else
    echo "❌ $path → $code"
  fi
done
```

### Check no EJS routes remain:

```bash
grep -r "reply\.view" src/routes/ | grep -v "node_modules" | grep "admin"
# Expected: 0 results when migration is complete
```

### Check Sidebar is fully React:

```bash
grep '"ejs"' admin-ui/src/components/Sidebar.tsx
# Expected: 0 results when all pages migrated
```

### Build verification:

```bash
cd admin-ui && npm run build
# Expected: exit code 0
```

---

## Automated Tests

### Jest tests to add:

```typescript
// admin-ui/src/__tests__/components/DataTable.test.tsx
// admin-ui/src/__tests__/components/FormField.test.tsx
// admin-ui/src/__tests__/components/PageHeader.test.tsx
```

### Cypress/E2E tests (if desired):

```typescript
// admin-ui/cypress/e2e/admin-pages.cy.ts
// - Visit each admin route
// - Verify title matches expected
// - Verify no console errors
```

---

## Console Error Test

For browser-based testing (using Puppeteer or Playwright):

```typescript
const browser = await puppeteer.launch();
const page = await browser.newPage();
page.on('console', msg => {
  if (msg.type() === 'error') fail(`Console error: ${msg.text()}`);
});
await page.goto('http://localhost:3000/admin/react/dashboard');
```

All pages must render with zero console errors.
