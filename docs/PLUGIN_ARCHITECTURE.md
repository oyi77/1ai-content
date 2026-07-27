# Plugin Architecture — Adoption Plan

## Current Pattern: Strategy Maps in Services

The codebase doesn't have a formal plugin registry. Instead, plugins are ad-hoc strategy maps registered at module level inside service files.

### Balance Checker (balance-checker.service.ts)

Each AI provider registers a `GenericOpenAIStrategy` with a `parse` callback:

```typescript
// balance-checker.service.ts — ~30 strategy entries
const strategies: Record<string, GenericOpenAIStrategy> = {
  openai: { parse: (d) => (d?.balance as number) ?? ... },
  anthropic: { parse: (d) => { ... } },
  cohere: { parse: (d) => ((d?.data as Record<string, unknown>)?.balance as number) ?? ... },
  // ... 25+ more providers
};
```

The `parse` function is the plugin contract — it normalizes each provider's credit-balance API response into a standard number.

**Problem**: Adding a provider means editing `balance-checker.service.ts` directly. No isolation, no lifecycle, one bad parse crashes the whole checker.

### Provider Router (provider-router.service.ts)

Routes model requests across providers by model name. Uses a config-driven lookup:

```typescript
const route = (model: string, userTier: string): ProviderConfig => {
  // tier-aware selection, circuit breaker check, cost optimization
};
```

Registration is implicit — providers are discovered from the config registry, not self-registered.

### Callback Handlers

Bot callback handlers (`handlers/callbacks/`) register via menu definitions:

```typescript
// navigation.ts
const keyboard: InlineKeyboardButton[][] = [
  [{ text: '📚 My Library', callback_data: 'library' }],
  [{ text: '⚙️ Settings', callback_data: 'settings' }],
];
```

Each `callback_data` value maps to a handler function in the dispatcher. This is the closest thing to a plugin registry — the menu structure IS the plugin list.

## Adoption Targets

### 1. Formalize PluginRegistry

```typescript
// src/lib/plugin-registry.ts
interface Plugin<T> {
  name: string;
  init(): Promise<void>;
  shutdown(): Promise<void>;
  // optional lifecycle hooks
  onConfigChange?(prev: T, next: T): void;
}
```

Start with balance checker strategies — they're the highest-count, lowest-risk migration.

### 2. Isolate Provider Balance Parsing

Each `GenericOpenAIStrategy` becomes a class:

```typescript
class OpenAIStrategy implements BalanceStrategy {
  name = 'openai';
  parse(d: Record<string, unknown>): number | undefined {
    return (d?.balance as number) ?? undefined;
  }
}
```

Registry: `PluginRegistry.register(new OpenAIStrategy(), { circuitBreaker: true })`

### 3. Apply to Payment Gateways

`payment.service.ts` already partially does this — `TripayService` is isolated in its own file. Next: make it implement a common `PaymentGateway` interface so webhook dispatch is registry-driven instead of `if (gateway === 'tripay')`.

## Migration Sequence

| Step | Files | What |
|------|-------|------|
| 1 | `src/lib/plugin-registry.ts` | Create `PluginRegistry` class |
| 2 | `src/services/balance-checker.service.ts` | Extract strategies to plugin files |
| 3 | `src/plugins/` | New `plugins/` directory, one file per strategy |
| 4 | `src/services/payment/tripay.service.ts` | Add `PaymentGateway` interface |
| 5 | `src/menus/` | Add menu-based plugin registration (already partially done) |

## Error Handling Rules

- Plugin init failure → log + continue (don't crash app)
- Plugin runtime error → isolate to that plugin, return fallback
- Parse failure → return `undefined`, caller handles
- All exceptions from plugin code MUST be caught — no untyped throws across plugin boundary
