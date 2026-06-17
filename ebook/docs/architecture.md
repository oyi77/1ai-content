# Architecture

This document describes the system architecture of the AI Ebook Generator.

## Overview

The AI Ebook Generator is a multi-stage pipeline application with a Streamlit frontend, FastAPI backend, SQLite persistence, and background job processing. All AI operations route through OmniRoute proxy for model orchestration.

## System Components

```
┌─────────────────┐
│  Streamlit UI   │ (Port 8501)
│   (app/)        │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌──────────────┐
│   FastAPI       │  │   SQLite     │
│   Backend       │◄─┤   Database   │
│   (src/api/)    │  │  (ebooks.db) │
└────────┬────────┘  └──────────────┘
         │
         ▼
┌─────────────────┐
│  Job Queue      │
│  (src/jobs/)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pipeline       │
│  Orchestrator   │
│  (src/pipeline/)│
└────────┬────────┘
         │
         ├──────────────────────────┐
         │                          │
         ▼                          ▼
┌─────────────────┐        ┌──────────────┐
│  AI Client      │        │  File System │
│  (OmniRoute)    │        │  (projects/) │
└─────────────────┘        └──────────────┘
```

## Pipeline Stages

The generation pipeline consists of sequential stages:

### 1. ProjectIntake
- **Input**: User idea, title, product mode, target word count
- **Process**: Validates input with Pydantic models, creates project record
- **Output**: Project ID, initial database record
- **Security**: XSS detection, SQL injection pattern detection

### 2. StrategyPlanner
- **Input**: Project brief
- **Process**: AI generates audience analysis, tone, goals
- **Output**: `strategy.json`
- **AI Model**: Configurable (default: auto/free-chat)

### 3. OutlineGenerator
- **Input**: Strategy
- **Process**: AI generates chapter structure with word count targets
- **Output**: `outline.json`, `toc.md`
- **Features**: Balanced chapter distribution, continuity planning

### 4. ManuscriptEngine
- **Input**: Outline, strategy
- **Process**: Sequential chapter generation with continuity tracking
- **Components**:
  - `ChapterGenerator`: Individual chapter generation
  - `ProgressTracker`: Progress reporting
- **Output**: `chapters/{n}.md`, `manuscript.md`
- **Features**: Token calibration, style consistency, retry logic

### 5. QAEngine
- **Input**: Manuscript, outline
- **Process**: Structural validation, word count checks
- **Output**: `qa_report.json`
- **Checks**: Chapter title matching, ±20% word count tolerance

### 6. ContentSafety
- **Input**: Manuscript
- **Process**: Keyword filtering, disclaimer injection
- **Output**: Sanitized manuscript
- **Features**: Configurable blocklist, automatic disclaimers

### 7. CoverGenerator
- **Input**: Project metadata
- **Process**: AI prompt generation + Pillow rendering
- **Output**: `cover/cover.png`, `cover/prompt.txt`
- **Features**: Product mode color coding, fallback rendering

### 8. Export
- **Input**: Manuscript, cover
- **Process**: DOCX generation, PDF conversion
- **Output**: `exports/ebook.docx`, `exports/ebook.pdf`
- **Security**: Path validation, extension validation

## Data Flow

### Project Creation Flow

```
User Input
    ↓
Pydantic Validation (XSS/SQL detection)
    ↓
ProjectIntake.create_project()
    ↓
ProjectRepository.create()
    ↓
SQLite INSERT
    ↓
Job Queue Enqueue
    ↓
Return Project ID
```

### Generation Flow

```
Job Worker Poll
    ↓
Orchestrator.run_pipeline()
    ↓
For each stage:
    ├─ Load previous stage output
    ├─ Call AI via OmniRoute
    ├─ Save stage output to disk
    ├─ Update progress in DB
    └─ Log with correlation ID
    ↓
Update project status
    ↓
Trigger webhooks (if configured)
```

## Database Schema

### Projects Table

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    idea TEXT NOT NULL,
    status TEXT NOT NULL,  -- draft, generating, completed, failed
    product_mode TEXT,     -- lead_magnet, paid_ebook, bonus_content, authority
    target_word_count INTEGER,
    chapter_count INTEGER,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Jobs Table

```sql
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,  -- pending, running, completed, failed
    created_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

## File System Layout

```
projects/{project_id}/
├── strategy.json           # Audience, tone, goals
├── outline.json            # Chapter structure
├── toc.md                  # Table of contents
├── manuscript.md           # Full manuscript
├── manuscript.json         # Metadata
├── qa_report.json          # Quality checks
├── chapters/
│   ├── 1.md
│   ├── 2.md
│   └── ...
├── cover/
│   ├── cover.png
│   └── prompt.txt
└── exports/
    ├── ebook.docx
    └── ebook.pdf
```

## Security Architecture

### Input Validation Layer

```
User Input
    ↓
Pydantic Models (src/models/validation.py)
    ├─ XSS Detection (script tags, javascript:)
    ├─ SQL Injection Detection (DROP, UNION, etc.)
    └─ Boundary Validation (length, ranges)
    ↓
Application Logic
```

### Path Validation Layer

```
File Operation Request
    ↓
PathValidator (src/utils/path_validator.py)
    ├─ Resolve absolute path
    ├─ Check containment in projects/
    ├─ Validate file extension
    └─ Block symlink traversal
    ↓
File System Access
```

### API Security Layer

```
HTTP Request
    ↓
Correlation ID Middleware
    ↓
Rate Limiting Middleware (10 req/min)
    ↓
Authentication Middleware (X-API-Key)
    ↓
Security Headers Middleware
    ↓
CORS Middleware
    ↓
Endpoint Handler
```

## Error Handling

### Structured Logging

All errors are logged with:
- **correlation_id**: Request tracing across stages
- **error_type**: Exception class name
- **context**: Operation name and parameters
- **severity**: error, warning, info

### Retry Logic

Transient errors are automatically retried:
- Network errors (ConnectionError, TimeoutError)
- HTTP 429 (rate limit), 503 (service unavailable)
- Exponential backoff: 0.1s, 0.2s, 0.4s, 0.8s

### Error Classification

- **Transient**: Retry automatically (network, timeout)
- **Permanent**: Fail immediately (validation, authentication)
- **Unknown**: Log and propagate

## Background Processing

### Job Queue

- **Storage**: SQLite table with status tracking
- **Worker**: Daemon thread polling every 1 second
- **Concurrency**: Single worker (sequential processing)
- **Persistence**: Jobs survive application restart

### Progress Tracking

- **Mechanism**: Callback function passed to pipeline stages
- **Granularity**: Per-chapter progress updates
- **Storage**: In-memory during generation, final status in DB

## AI Integration

### OmniRoute Proxy

- **Purpose**: Multi-provider AI routing and load balancing
- **Protocol**: OpenAI-compatible API
- **Configuration**: `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`
- **Models**: Configurable per operation (manuscript, cover, etc.)

### Token Management

- **Calibration**: `TokenCalibrator` learns optimal token budgets
- **Strategy**: Rolling average over 3+ samples
- **Safety**: 4x base cap to prevent cost explosion
- **Persistence**: Calibration data saved to disk

## Deployment Architecture

### Development

```
localhost:8501  → Streamlit UI
localhost:8765  → FastAPI API
localhost:20128 → OmniRoute Proxy
```

### Production (systemd)

```
ebook-generator.service  → Streamlit UI
ebook-api.service        → FastAPI API
nginx                    → Reverse proxy
```

### Docker

```
docker-compose.yml
├── ebook-ui     → Streamlit container
├── ebook-api    → FastAPI container
└── omniroute    → OmniRoute container (optional)
```

## Performance Considerations

### Bottlenecks

1. **AI Generation**: Sequential chapter generation (5-10 min per chapter)
2. **PDF Conversion**: LibreOffice subprocess (5-10 seconds)
3. **Database**: SQLite single-writer limitation

### Optimizations

1. **Token Calibration**: Reduces AI costs by 20-30%
2. **Background Jobs**: Non-blocking UI during generation
3. **Progress Tracking**: Real-time feedback to users
4. **Caching**: Strategy and outline reused across retries

## Monitoring

### Metrics to Track

- **Generation Success Rate**: completed / (completed + failed)
- **Average Generation Time**: Per project, per chapter
- **AI Token Usage**: Per stage, per model
- **Error Rate**: By error_type, by stage
- **API Response Time**: P50, P95, P99

### Log Aggregation

Structured logs support:
- **Elasticsearch**: JSON format, correlation_id indexing
- **Datadog**: error_type tagging, context filtering
- **CloudWatch**: Log groups by severity

## See Also

- [API Documentation](api.md)
- [Security Features](security.md)
- [Testing Strategy](testing.md)
- [Deployment Guide](deployment.md)
