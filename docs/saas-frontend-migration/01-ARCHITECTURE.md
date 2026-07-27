# Architecture & Conventions

> Route design, component tree, shared patterns. All agents MUST read this before starting any task.

---

## 1. Route Architecture

### Current

```
/admin/*           → Fastify route → reply.view("admin/*.ejs")
/admin/react/*     → Fastify static → React SPA
/app               → Fastify route → reply.view("web/app.ejs")
/                  → Fastify route → reply.view("web/landing.ejs")
```

### Target

```
/admin/*           → Fastify route → reply.redirect("/admin/react/*")  (after migration)
/admin/react/*     → Fastify static → React SPA
/app/*             → Fastify static → React SPA  (new)
/*                 → Fastify static → React SPA  (public pages)
```

### React Router Tree

```tsx
// admin-ui/src/App.tsx
<BrowserRouter basename="">
  {/* Admin routes */}
  <Route path="/admin/react" element={<Navigate to="/admin/react/dashboard" />} />
  <Route path="/admin/react" element={<AdminLayout />}>
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="analytics" element={<Analytics />} />
    <Route path="content" element={<Content />} />
    ...all 33 admin pages...
  </Route>

  {/* Customer routes (Phase 2) */}
  <Route path="/app" element={<CustomerLayout />}>
    <Route path="dashboard" element={<CustomerDashboard />} />
    <Route path="create" element={<CreateVideo />} />
    ...all customer pages...
  </Route>

  {/* Public routes (Phase 3) */}
  <Route path="/" element={<Landing />} />
  <Route path="/faq" element={<Faq />} />
  <Route path="/terms" element={<Tos />} />
  <Route path="/privacy" element={<Privacy />} />
</BrowserRouter>
```

### Static Serving Strategy

**Do NOT change `vite.config.ts` base** — keep `base: "/admin/react/"` for now.
Add separate Fastify static registration for customer app + public pages in Phase 2/3.

---

## 2. Component Pattern Reference

Every page follows ONE of these patterns. Pick the right one before coding.

### Pattern A: Simple Card Display (Read-Only)

```tsx
// pages/admin/Research.tsx
export default function Research() {
  const { data, loading, error } = useApi<ResearchData>('/api/research');

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error} />;
  if (!data) return <EmptyState />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.items.map(item => (
        <Card key={item.id}>
          <CardContent>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Used by:** Trending, Calendar, Research, Medias, Looping, Remeta, Repurpose

### Pattern B: CRUD Table

```tsx
// pages/admin/Fanpage.tsx
export default function Fanpage() {
  const { data, loading, error, refetch } = useApi<Fanpage[]>('/api/fanpages');
  const [editing, setEditing] = useState<Fanpage | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error} onRetry={refetch} />;

  return (
    <div>
      <PageHeader title="Fanpage Manager" action={<Button onClick={() => setShowCreate(true)}>+ Add</Button>} />
      <DataTable
        columns={[
          { key: 'pageName', label: 'Page Name' },
          { key: 'pageId', label: 'Page ID' },
          { key: 'fanCount', label: 'Fans' },
          { key: 'isActive', label: 'Status', render: (v) => v ? '✅ Active' : '⛔ Inactive' },
        ]}
        data={data}
        onEdit={(item) => setEditing(item)}
        onDelete={handleDelete}
      />
      {showCreate && <CreateFanpageModal onClose={() => { setShowCreate(false); refetch(); }} />}
      {editing && <EditFanpageModal fanpage={editing} onClose={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}
```

**Used by:** Fanpage, Prompts, Interceptions, Pricing, Dynamic Pricing, Personas, Captions, Cloak, Engagement

### Pattern C: Form Submit

```tsx
// pages/admin/AIConfig.tsx
export default function AIConfig() {
  const { data, loading } = useApi<AIConfig>('/api/admin/ai-config');
  const form = useForm({ defaultValues: data });

  async function handleSubmit(values: AIConfig) {
    await postJson('/api/admin/ai-config', values);
    toast.success('Saved');
  }

  if (loading) return <LoadingSpinner />;
  return (
    <Form form={form} onSubmit={handleSubmit}>
      <FormField name="provider" label="Default Provider" type="select" options={providers} />
      <FormField name="model" label="Model" />
      <FormField name="temperature" label="Temperature" type="number" min={0} max={2} step={0.1} />
      <Button type="submit">Save</Button>
    </Form>
  );
}
```

**Used by:** AI Config, Providers, Settings

### Pattern D: Dashboard Widget

```tsx
// pages/admin/Dashboard.tsx
export default function Dashboard() {
  const { data } = useApi<DashboardData>('/api/admin/dashboard');
  // Already exists — keep as-is
}
```

**Used by:** Dashboard (already done)

### Pattern E: Complex Tool (Multi-Step / Embedded)

```
Used by: Playground, Autopilot, Create Wizard, Storyboard
→ Each gets a custom implementation with specialized state management
```

---

## 3. Shared Hooks

### `useApi<T>` — Generic data fetching hook

```tsx
// hooks/useApi.ts
interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useApi<T>(url: string, options?: RequestInit): UseApiResult<T>
```

**Implementation:** Uses `fetch()` with credentials, returns typed data.
Uses AbortController for cleanup on unmount.
Auto-retry on 401 → redirect to login.

### `useAuth` — Auth context

```tsx
// hooks/useAuth.ts
interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}
```

**Admin auth:** Cookie-based (`admin_token`), uses `checkAuth()` from client.ts
**Customer auth:** JWT token in localStorage (`Bearer` header)

---

## 4. CSS & Styling Convention

| Source | Usage |
|--------|-------|
| `admin-skin.css` | Admin pages — already imported in admin-ui |
| Tailwind utility classes | Inline styling via `className` |
| CSS Modules (`.module.css`) | Page-specific overrides (rare) |

**No inline `<style>` tags** — all CSS goes through the Tailwind pipeline.

---

## 5. State Management

| Pattern | When to Use |
|---------|-------------|
| `useState` + `useEffect` | Simple pages, single data fetch |
| `useApi` hook (custom) | Most admin pages — standard fetch |
| `useForm` (react-hook-form) | Form-heavy pages (Settings, AI Config) |
| `useReducer` | Multi-step wizard (Create Video) |
| React Context | Auth state, global config |

**No Redux, no Zustand** — keep it simple. Only add state management lib if a clear need emerges.

---

## 6. Error Handling Pattern

Every page MUST handle these states:

```tsx
if (loading) return <LoadingSpinner />;
if (error) return <ErrorDisplay message={error} onRetry={refetch} />;
if (!data || data.length === 0) return <EmptyState title="No data" description="Nothing found." />;
return <ActualContent data={data} />;
```

### Shared components:
- **`LoadingSpinner`** — centered spinner with optional text
- **`ErrorDisplay`** — error icon + message + retry button
- **`EmptyState`** — icon + title + description + optional action button

---

## 7. Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Page components | PascalCase | `Fanpage.tsx`, `AIConfig.tsx` |
| Shared components | PascalCase | `DataTable.tsx`, `FormField.tsx` |
| Hooks | `use*` camelCase | `useApi.ts`, `useAuth.ts` |
| API client functions | camelCase | `fetchAnalytics()`, `postJson()` |
| CSS module files | camelCase | `fanpage.module.css` |
| Route paths | kebab-case | `/admin/ai-config` |

---

## 8. Build & Deployment

```
npm run build   → builds admin-ui/dist/
                → served by Fastify @fastify/static at /admin/react/

No Docker changes needed.
No CI/CD changes needed.
```
