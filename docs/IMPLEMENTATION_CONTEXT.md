# Implementation Context for Sub-Agents

## Project Stack
- TypeScript + Node.js 20
- Telegraf (Telegram bot), Fastify (backend), EJS (frontend)
- PostgreSQL + Prisma ORM
- BullMQ + Redis (ioredis)
- Zod validation, Winston logging

## Import Patterns
```typescript
import { getConfig } from "@/config/env";        // env vars with defaults
import { prisma } from "@/config/database";       // Prisma client
import { logger } from "@/utils/logger";          // Winston logger
import { bullmqRedis } from "@/config/redis";     // Redis for BullMQ
```

## Path Alias
- `@/*` maps to `src/*` (configured in tsconfig.json)

## File Conventions
- Services: `src/services/youtube/<name>.service.ts`
- Workers: `src/workers/youtube/<name>.worker.ts`
- Commands: `src/commands/youtube/<name>.ts`
- Routes: `src/routes/youtube/<name>.route.ts`
- Views: `src/views/youtube/<name>.ejs`

## YouTube Config Pattern
```typescript
import { getYtConfigValue } from "@/config/youtube.config";
// All thresholds come from env vars via getConfig() with defaults
```

## YouTube Queue Pattern
```typescript
import { ideationQueue } from "@/config/youtube-queue";
// Queue instances are pre-created, just add jobs
```

## YouTube Types
```typescript
import type { YtChannelCreate, YtSeoPackage, ... } from "@/types/youtube.types";
```

## Prisma Models (already created)
- YtChannel, YtPublishedVideo, YtIdea, YtVideoMetrics
- YtQuarantineLog, YtNicheCpmResearch, YtBreakoutCluster, YtAgentTaskLog

## Error Handling Pattern
- Services return `{ success: boolean; data?: T; error?: string }`
- Use try/catch with logger.error()
- Never swallow errors silently

## Existing Patterns to Follow
- Services are class-based with static methods OR module-level functions
- Config reads via getConfig() — NEVER hardcode values
- BullMQ jobs use typed payloads
- Database operations use Prisma client directly
