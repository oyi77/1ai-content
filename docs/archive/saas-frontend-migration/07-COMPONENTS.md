# Component Inventory & Reuse

> Shared components across all phases. Create once, reuse everywhere.

---

## Shared Components

### 1. `<DataTable />`
```tsx
// components/DataTable.tsx
interface Column<T> {
  key: string;
  label: string;
  render?: (value: any, row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  actions?: (row: T) => ReactNode;  // custom action buttons
  loading?: boolean;
  emptyMessage?: string;
}
```

**Used by:** T12 (Fanpage), T13 (Prompts), T14 (Interceptions), T15 (A/B Tests), T16 (Personas), T27 (Autopilot)

**States:** Loading skeleton → Data rows → Empty state → Error state

### 2. `<FormField />`
```tsx
// components/FormField.tsx
interface FormFieldProps {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'toggle' | 'password';
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}
```

**Used by:** All form-based pages (T17 Pricing, T28 AI Config, T29 Providers, T38 Billing)

### 3. `<Card />` + `<CardContent />`
```tsx
// components/Card.tsx
interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}
```

**Used by:** T04 (Trending), T05 (Calendar), T10 (Research), T11 (Medias)

### 4. `<PageHeader />`
```tsx
// components/PageHeader.tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;  // usually a button
  tabs?: { label: string; key: string }[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}
```

**Used by:** Every admin page

### 5. `<LoadingSpinner />`
```tsx
// components/LoadingSpinner.tsx
interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;  // for inside buttons, etc.
}
```

**Used by:** Every page

### 6. `<ErrorDisplay />`
```tsx
// components/ErrorDisplay.tsx
interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  fullPage?: boolean;  // centers in viewport
}
```

**Used by:** Every page

### 7. `<EmptyState />`
```tsx
// components/EmptyState.tsx
interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;  // "Create first item" button
  icon?: string;      // emoji or SVG name
}
```

**Used by:** Every page with list data

### 8. `<ConfirmDialog />`
```tsx
// components/ConfirmDialog.tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Used by:** CRUD pages (delete confirmations)

---

## Admin-Specific Components

| Component | Description | Used By |
|-----------|-------------|---------|
| `<AdminLayout />` | Sidebar + header + content area | All admin pages (exists) |
| `<Sidebar />` | Navigation sidebar (exists) | All admin pages (exists) |
| `<StatsGrid />` | 4-column stat cards | Dashboard, Analytics |
| `<ToolGrid />` | Grid of tool cards | Video Tools |

## Customer-Specific Components

| Component | Description | Used By |
|-----------|-------------|---------|
| `<CustomerLayout />` | Simplified layout, no admin sidebar | All customer pages |
| `<WizardStepper />` | 6-step progress indicator | Create Video |
| `<NicheCard />` | Emoji + name selectable card | Create Video step 1 |
| `<VideoCard />` | Thumbnail + title + status | Dashboard, My Videos |
| `<PackageCard />` | Pricing package display | Billing |
| `<StatusBadge />` | Status with color coding | My Videos |

## Public Pages Components

| Component | Description | Used By |
|-----------|-------------|---------|
| `<PublicLayout />` | Navbar + footer | Landing, FAQ, TOS, Privacy |
| `<HeroSection />` | Animated hero | Landing |
| `<FeatureGrid />` | Feature cards | Landing |
| `<PricingCards />` | Dynamic pricing from API | Landing |
| `<TestimonialCarousel />` | Review/testimonial slider | Landing |
| `<FAQAccordion />` | Expandable FAQ items | Landing, FAQ |
| `<Footer />` | Site footer | All public pages |

---

## Creating Components

### Rules for shared components:
1. Create in `admin-ui/src/components/<Name>.tsx`
2. One component per file
3. Export as default
4. Test in isolation before using in pages
5. Document props with TypeScript interfaces

### When to create a new component:
- Used in 2+ pages → make it shared
- Single page but complex logic → make it page-specific (in `pages/<page>/`)
- Used across admin AND customer → put in `components/` root
