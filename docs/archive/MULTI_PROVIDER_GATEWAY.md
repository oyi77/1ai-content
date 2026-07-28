# Multi-Provider Gateway — Adoption Plan

## Current Architecture

### AI Provider Routing

The app routes model requests across ~30+ AI providers through `provider-router.service.ts`. Each provider has:

1. **API endpoint** (base URL + auth key from env or DB)
2. **Models** it serves (prefixed strings like `openai/gpt-4`, `anthropic/claude-3`)
3. **Balance check strategy** (how to query remaining credits)
4. **Circuit breaker state** (recent failure rate per provider)

The routing decision considers:

```typescript
// provider-router.service.ts — dispatch logic
function selectProvider(model: string, tier: string): { provider: string; config: ProviderConfig } {
  const candidates = registry.filter(p => p.models.includes(model) && p.enabled);
  // 1. Filter by tier (higher tiers unlock more providers)
  // 2. Exclude tripped circuit breakers
  // 3. Pick lowest-cost available provider
  return optimizeCost(candidates);
}
```

### Balance Checker

`balance-checker.service.ts` polls each provider's credit API. Structure:

```typescript
interface GenericOpenAIStrategy {
  name: string;
  baseUrl: string;
  apiKey: string;
  parse(d: Record<string, unknown>): number | undefined;
}
```

Each provider has a `parse` function that extracts the balance from their API response. After R6, all parse functions explicitly cast intermediate objects:

```typescript
parse: (d: Record<string, unknown>) => {
  const data = d?.data as Record<string, unknown> | undefined;
  const credits = d?.credits as Record<string, unknown> | undefined;
  return (data?.balance as number) ?? (d?.balance as number) ?? (credits?.remaining as number);
}
```

### Payment Gateway

Two parallel paths:

| Path | File | Status |
|------|------|--------|
| Direct Tripay | `services/payment/tripay.service.ts` | Working end-to-end |
| Unified PaymentService | `services/payment/payment.service.ts` | Hardcodes `gateway: 'midtrans'`, 1ai-payment service not running |

The Tripay handler in `routes/webhook.ts` has a `statusMap` for Tripay-specific states:

```typescript
const statusMap: Record<string, string> = {
  PAID: 'success',
  EXPIRED: 'failed',
  FAILED: 'failed',
  CANCELLED: 'failed',
};
```

## Known Gaps

### 1. Provider Discovery
- No self-registration — each provider must be added in 3 places (router, balance checker, env config)
- Adding a provider means editing `provider-router.service.ts` AND `balance-checker.service.ts`

### 2. Unified Payment
- `PaymentService` calls `1ai-payment` API (port 3100) — but that service isn't running
- `PaymentService` hardcodes `gateway: 'midtrans'`, can't process Tripay
- `1AI_PAYMENT_URL` env var exists but isn't in the Zod schema (`env.ts`)

### 3. Circuit Breaker Granularity
- One circuit breaker per provider, but some providers have multiple models with different reliability
- No per-model breakers

### 4. Balance Checker Failure Isolation
- A crash in one provider's `parse` function takes down the entire balance checker
- Each parse should be wrapped in try/catch independently

## Adoption Steps

### Step 1: Provider Self-Registration
```typescript
// ProviderPlugin interface
interface ProviderPlugin {
  name: string;
  models: string[];
  baseUrl: string;
  checkBalance(): Promise<number | undefined>;
  complete(model: string, messages: Message[]): Promise<CompletionResult>;
}
```

Each provider gets its own file under `src/plugins/providers/`.

### Step 2: Fix Payment Gateway
- Add `1AI_PAYMENT_URL` to `env.ts` Zod schema
- Make `PaymentService` accept a `gateway` parameter
- Convert Tripay direct path to use `PaymentGateway` interface

### Step 3: Parallelize Balance Checking
- Run all provider balance checks concurrently (`Promise.allSettled`)
- Report individual failures instead of crashing the batch
- Cache results with TTL to avoid hammering provider APIs

### Step 4: Model-Level Circuit Breakers
- Track failures per model, not just per provider
- Fall back to same provider's alternative model before trying a different provider

## Cross-Cutting: Type Safety

After R6 (`:any` removal in `src/`):

| Pattern | Previous | Now |
|---------|----------|-----|
| Balance parse params | `d: any` | `d: Record<string, unknown>` |
| Intermediate access | `d.data.balance` (any) | `(d?.data as Record<string, unknown>)?.balance as number` |
| Callback params | `message: any` | `message as unknown as Record<string, unknown>` |
| Keyboard button items | `any[]` | `InlineKeyboardButton[][]` |

## Key Files

| File | Role |
|------|------|
| `src/services/provider-router.service.ts` | Model → provider routing |
| `src/services/balance-checker.service.ts` | Provider credit polling |
| `src/services/payment/tripay.service.ts` | Tripay gateway implementation |
| `src/services/payment/payment.service.ts` | Unified payment abstraction |
| `src/routes/webhook.ts` | Payment webhook handler (Tripay + future) |
| `src/config/env.ts` | Environment config schema |
