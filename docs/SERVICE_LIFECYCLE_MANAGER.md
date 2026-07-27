# Service Lifecycle Manager — Adoption Plan

## Current State

### How the App Starts

Entry point: `src/index.ts` (Fastify + telegraf bot)

```typescript
// src/index.ts — simplified startup sequence
async function main() {
  // 1. Load config
  const config = loadConfig();

  // 2. Init database (Prisma)
  await prisma.$connect();

  // 3. Init Redis
  await redis.connect();

  // 4. Create Fastify server
  const app = fastify({ ... });

  // 5. Register plugins & routes
  app.register(fastifyStatic, { root: publicDir, prefix: '/public/' });
  registerRoutes(app);

  // 6. Start bot (telegraf)
  const bot = new Telegraf(token);
  setupCommands(bot);
  setupHandlers(bot);

  // 7. Start HTTP server
  await app.listen({ port: 3002, host: '0.0.0.0' });

  // 8. Launch bot polling
  await bot.launch();
}
```

### Running Services

| Service | Type | Port | Managed By |
|---------|------|------|------------|
| Node.js app (Fastify + bot) | Long-lived process | 3002 | hub / direct tsx |
| Python FastAPI | Long-lived process | 8767 | systemd (`1ai-content-py`) |
| PostgreSQL | External | 5432 | systemd |
| Redis | External | 6379 | systemd |
| nginx (via cf-router) | Reverse proxy | 6969 | systemd |

### Shutdown

Current shutdown in `index.ts`:

```typescript
process.on('SIGTERM', async () => {
  await bot.stop('SIGTERM');
  await app.close();
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});
```

## Problems

### 1. No health check endpoint
The app has a `/health` route (`routes/health.ts`) but no dependency-aware health reporting. A route handler returning `{ ok: true }` while Redis is down is misleading.

### 2. Service dependency ordering
Startup assumes Prisma and Redis are already available. If they're not, the app crashes immediately with an unhelpful error. No retry/backoff.

### 3. Python service coupling
The Python API on port 8767 is critical for media processing (video generation, image processing), but its lifecycle is independent — there's no graceful degradation when it's down.

### 4. Graceful degradation gaps
- Bot database queries: no circuit breaker for DB failures
- AI provider calls: circuit breaker exists per provider but only in the router
- Payment webhooks: if Tripay is down, payment processing silently drops

### 5. No ready signal for orchestration
The PM2/hub manager has no way to know the app is fully initialized (DB connected, routes registered, bot polling). Adding a readiness probe would enable reliable orchestration.

## Adoption Plan

### Phase 1: Service Registry

```typescript
// src/lib/service-registry.ts
interface ManagedService {
  name: string;
  dependencies: string[];
  init(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<HealthStatus>;
}

const registry = new ServiceRegistry();
registry.register('db', prismaService);
registry.register('redis', redisService);
registry.register('bot', botService, { dependsOn: ['db', 'redis'] });
registry.register('http', httpService, { dependsOn: ['db', 'redis'] });

await registry.startAll();  // topologically sorted
```

### Phase 2: Dependency-Aware Health

Replace the `/health` route with:

```typescript
GET /health → {
  status: 'healthy' | 'degraded' | 'down',
  services: {
    db: { status: 'up', latency: '2ms' },
    redis: { status: 'up', latency: '1ms' },
    python_api: { status: 'degraded', error: 'Connection refused' },
    bot: { status: 'up' },
  },
  timestamp: '...',
}
```

### Phase 3: Graceful Degradation

When a dependency fails:

| Scenario | Behavior |
|----------|----------|
| DB down | Return cached data; queue writes for replay |
| Redis down | Fall back to in-memory LRU with degraded TTL |
| Python API down | Disable media generation; show "coming soon" in UI |
| AI provider down | Circuit breaker; try next provider; fail last resort |
| Payment gateway down | Queue payment; retry with backoff |

### Phase 4: Readiness Probe

After `startAll()` completes, the app should:

1. Open a readiness TCP port (e.g., 3003)
2. Accept connections only when ALL essential services are healthy
3. Orchestrator (hub/PM2) probes `/ready` before routing traffic

## Implementation Priority

| Priority | Component | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | Graceful provider failure (circuit breaker improvement) | Low | High — prevents cascading failures |
| P0 | Dependency-aware health endpoint | Low | High — enables monitoring |
| P1 | Service registry with topological start | Medium | Medium — improves startup reliability |
| P1 | Python API health probing + degradation | Medium | Medium — surface python API status in main app |
| P2 | Graceful DB degradation (read-through cache) | High | Low — DB failures are rare |

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | Current startup sequence |
| `src/routes/health.ts` | Basic health endpoint |
| `src/config/database.ts` | Prisma connection |
| `src/config/redis.ts` | Redis connection |
| `services/api.py` | Python media processing API |
| `~/.cloudflare-router/` | nginx/cf-router config |
