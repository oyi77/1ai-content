# 01 — Architecture

## System Architecture

```mermaid
graph TB
    User[Telegram User] --> Bot[Telegraf Bot]
    Bot --> Commands[Commands Layer]
    Bot --> Handlers[Handlers Layer]
    
    Commands --> Services[Services Layer]
    Handlers --> Services
    
    Services --> Prisma[(PostgreSQL)]
    Services --> Redis[(Redis)]
    Services --> Queue[BullMQ Queue]
    
    Queue --> Workers[Workers]
    Workers --> AI[AI Providers]
    Workers --> Video[Video Generation]
    
    Services --> Admin[Admin Dashboard]
    Admin --> Fastify[Fastify Server]
    
    Services --> Ecosystem[Ecosystem]
    Ecosystem --> Social[1ai-social]
    Ecosystem --> Affiliate[1ai-affiliate]
```

## Data Flow: Video Generation

```mermaid
sequenceDiagram
    participant U as User
    participant B as Bot
    participant S as Service
    participant Q as Queue
    participant W as Worker
    participant AI as AI Provider
    participant DB as Database
    
    U->>B: /create command
    B->>S: createVideo()
    S->>DB: Store request
    S->>Q: Add job
    S-->>U: "Processing..."
    
    Q->>W: Pick up job
    W->>AI: Generate content
    AI-->>W: Return media
    W->>DB: Update status
    W-->>U: Send video
    
    Note over W,AI: 9-tier fallback if provider fails
```

## Component Layers

### 1. Commands Layer (`src/commands/`)
- Entry points for Telegram commands
- Input validation and parsing
- Delegates to services

### 2. Handlers Layer (`src/handlers/`)
- Callback query handlers (inline buttons)
- Message handlers (state-based conversations)
- Error handling and retry logic

### 3. Services Layer (`src/services/`)
- Core business logic (82 service files)
- Database operations via Prisma
- External API integrations
- Circuit breaker pattern for resilience

### 4. Routes Layer (`src/routes/`)
- Fastify HTTP endpoints
- Admin dashboard routes
- Webhook handlers (payment gateways)
- Ecosystem integration endpoints

### 5. Workers Layer (`src/workers/`)
- BullMQ job processors
- Video generation pipeline
- Cleanup and maintenance jobs
- Daily/weekly report generation

## Provider Fallback Chain

```mermaid
graph LR
    Request --> Primary[Primary Provider]
    Primary -->|Fail| Fallback1[Fallback 1]
    Fallback1 -->|Fail| Fallback2[Fallback 2]
    Fallback2 -->|Fail| ...[...]
    ... --> Last[Last Resort]
    
    style Primary fill:#4CAF50
    style Fallback1 fill:#FFC107
    style Fallback2 fill:#FF9800
    style Last fill:#F44336
```

9-tier fallback with circuit breaker:
1. Gemini (Google)
2. OpenAI
3. Grok (xAI)
4. OmniRoute
5. And 5 more providers...

## Database Schema

See [06-data-model.md](06-data-model.md) for full ER diagram.

Core entities:
- **User** — Telegram users with credits and tier
- **Video** — Generated video records
- **Transaction** — Payment transactions
- **Subscription** — User subscriptions
- **Commission** — Affiliate commissions

## Security Boundaries

| Layer | Auth | Validation |
|-------|------|------------|
| Bot | Telegram ID | Input sanitization |
| Admin | Password + JWT | Session management |
| Webhook | Signature verification | Payload validation |
| Ecosystem | HMAC-SHA256 | Timestamp + service key |

## Deployment

```
┌─────────────────────────────────────────┐
│           Cloudflare Tunnel             │
│         *.aitradepulse.com              │
└───────────────────┬─────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ↓           ↓           ↓
   content:3000  social:8200  affiliate:3001
        │           │           │
        └───────────┼───────────┘
                    │
                    ↓
            ┌───────────────┐
            │  PostgreSQL   │
            │    Redis      │
            └───────────────┘
```
