# 03 — Security

## Authentication Architecture

The admin system uses **cookie-token auth** with a **Basic auth fallback**.

### Auth Flow

```
1. User visits /admin/dashboard (no auth cookie)
2. adminRoutes onRequest hook fires
3. isAdminRoute = true → verifyAdmin()
4. verifyAdmin():
   a. Check request.cookies.admin_token
   b. If present: HMAC-SHA256 verify against ADMIN_PASSWORD
   c. If valid: pass
   d. If invalid: check Authorization: Basic header
   e. If Basic valid: pass (legacy support)
   f. If neither: return 401
```

### Login Endpoint

```
POST /admin/login
Body: { password: "admin123" }

Success: Set-Cookie: admin_token=<hmac>, path=/, maxAge=86400
Redirect to /admin/dashboard
```

`admin_token` is HMAC-SHA256 of `ADMIN_PASSWORD` using key `"openclaw-admin-v1"`.

### Cookie Configuration

```typescript
// src/routes/admin.ts
reply.setCookie("admin_token", token, {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 86400, // 24 hours
});
```

## Auth Middleware (`src/routes/admin.ts` lines 164–241)

All `/admin/*` paths are protected EXCEPT:
- `/admin/login` — login form
- `/admin/assets/*` — static assets (JS, CSS, images)

### How `isAdminRoute` Works

The `onRequest` hook checks `request.url` (before the `?` query string) against an explicit list plus a broad catch-all:

```typescript
const isAdminRoute =
  // Exact path matches
  url === "/admin" ||
  url === "/admin/dashboard" ||
  url === "/admin/pricing" ||
  // ... (all SPA routes listed explicitly)
  // API prefix matches
  url.startsWith("/api/stats") ||
  url.startsWith("/api/analytics") ||
  // ... (all API prefixes listed)
  // Broad catch-all: any /admin/* path that ISN'T login or assets
  (url.startsWith("/admin/") &&
   url !== "/admin/login" &&
   !url.startsWith("/admin/assets/"));
```

This catch-all (line 233–237) is the **defense-in-depth** — it catches any SPA virtual route (e.g. `/admin/analytics/calendar`, `/admin/tools/cloak`) even if the explicit list misses one.

### Adding a New Admin Path

If you add a new admin SPA page or API endpoint:

1. **Add the React route** in `admin-ui/src/App.tsx`
2. **If it's an API path** — check if it starts with an existing prefix in the `isAdminRoute` list. If not, add a new `startsWith()` entry.
3. **If it's an SPA path** — add an exact URL match to the explicit list, OR rely on the catch-all (recommended for simplicity).

### Auth Hook Bypass (Path Traversal Protection)

The SPA catch-all `GET /admin/*` handler includes additional protection:

```typescript
// src/routes/admin.ts lines 819-825
const rawPath = new URL(request.url, "http://localhost").pathname.replace("/admin/", "");
const decoded = decodeURIComponent(rawPath);
const normalized = path.posix.normalize(decoded);
if (normalized.startsWith("..") || normalized.startsWith("/")) {
  return reply.callNotFound();
}
```

This ensures:
- URL-encoded traversal (`/admin/..%2F..%2Fetc%2Fpasswd`) is caught after `decodeURIComponent`
- Absolute paths within `/admin/` are caught after `normalize`
- The auth hook fires FIRST (before this handler), so unauthenticated traversal attempts are blocked at the auth layer

## Path Traversal Defense

**Two layers of protection:**

| Layer | Where | What |
|-------|-------|------|
| 1 | `@fastify/static` plugin | Internally rejects paths outside root — returns 404 |
| 2 | SPA catch-all handler (admin.ts:819-825) | `decodeURIComponent` → `path.posix.normalize` → reject `..` or `/` prefixes |

Without layer 2, `/admin/..%2F..%2Fetc%2Fpasswd` would hit the SPA catch-all, fail the extension check, and serve `index.html` (not dangerous, but leaks the SPA).

## Auth Bypass of SPA Virtual Routes

**Problem:** Before the fix at commit `cb99309`, the SPA catch-all was registered with `app.get("/admin/*", ...)` OUTSIDE the `adminRoutes()` function. This meant the `onRequest` auth hook never fired for SPA virtual paths like `/admin/analytics/calendar`.

**Fix:** Moved the SPA catch-all inside `adminRoutes()` so the auth hook covers all handler routes.

**Verification:** Curl without cookie returns `401` for all `/admin/*` paths.

## Rate Limiting

- **Global**: `@fastify/rate-limit` configured at 100 requests per minute per IP (configurable)
- **Login endpoint**: Rate-limited via Redis-backed sliding window to prevent brute force (from the Jest test `admin-auth.e2e.test.ts`)

## Security Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Auth fires for ALL admin paths | ✅ | Broad catch-all in `isAdminRoute` |
| Path traversal blocked | ✅ | Two-layer defense |
| Static assets bypass auth (no cookie needed) | ✅ | `/admin/assets/*` excluded from `isAdminRoute` |
| Login page is public | ✅ | `/admin/login` excluded |
| Cookies are httpOnly | ✅ | `httpOnly: true` |
| Stateless auth (no sessions) | ✅ | HMAC token, no server-side session store |
| Rate limiting on login | ✅ | Redis-backed |
| CORS configured | ✅ | Allows configured origins |

## Non-Security Admin Access via Python

The Python FastAPI server on port 8767 has NO auth middleware — it relies on:
1. Being accessible only via `localhost:8767` (not exposed externally)
2. The nginx reverse proxy at `/api/py/` which strips the prefix and passes through

This means any request that reaches the Node.js server at port 3002 can hit the Python API. The Node.js server does NOT proxy Python endpoints — they're proxied directly by nginx. The Python API should NOT be considered authenticated.