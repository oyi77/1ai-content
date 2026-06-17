# AI Ebook Generator

AI-powered ebook generation pipeline with Streamlit frontend and FastAPI backend. Generate complete ebooks from a single idea using OmniRoute AI orchestration.

## Features

- **Multi-stage AI pipeline**: Strategy → Outline → Manuscript → QA → Cover → Export
- **Security hardened**: SQL injection prevention, path traversal protection, input validation, rate limiting
- **Comprehensive error handling**: Structured logging with correlation IDs, graceful degradation
- **High test coverage**: 78% overall, 96-100% on security-critical modules
- **Multiple export formats**: DOCX and PDF generation
- **Product modes**: Lead magnet, paid ebook, bonus content, authority building
- **Background job processing**: SQLite-backed queue with threaded workers
- **REST API**: FastAPI backend for programmatic access

## Quick Start

```bash
# Clone and setup
git clone <repository-url>
cd 1ai-ebook
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
pip install -e .

# Configure environment
cp .env.example .env
# Edit .env with your settings (see Environment Variables section)

# Install LibreOffice (required for PDF export)
sudo apt install libreoffice  # Ubuntu/Debian
# brew install libreoffice     # macOS

# Run the application
streamlit run app/Home.py      # UI on http://localhost:8501
python run_api.py              # API on http://localhost:8765
```

## Installation

### Requirements

- Python 3.11+
- LibreOffice (for PDF conversion)
- OmniRoute AI proxy (local or remote)

### Dependencies

Core dependencies (installed automatically):
- `streamlit>=1.28.0` - Web UI framework
- `openai>=1.3.0` - AI client SDK (used with OmniRoute)
- `python-docx>=1.1.0` - DOCX generation
- `Pillow>=10.0.0` - Cover image rendering
- `pydantic>=2.5.0` - Data validation
- `python-dotenv>=1.0.0` - Environment configuration

Development dependencies:
```bash
pip install -e ".[dev]"  # Includes pytest, pytest-cov, ruff
```

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
# Required: OmniRoute AI Proxy
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=sk-your-key-here

# Required: API Authentication
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
EBOOK_API_KEY=your-secure-api-key-here

# Optional: adforge Integration
ADFORGE_URL=http://localhost:3000
ADFORGE_API_KEY=your-adforge-jwt-token

# Optional: AI Model Selection
EBOOK_MANUSCRIPT_MODEL=auto/free-chat

# Optional: Port Configuration
UI_PORT=8501
API_PORT=8765
```

**Security Note**: Never commit `.env` files or use default API keys in production.

## Running the Application

### Streamlit UI (Recommended)

```bash
streamlit run app/Home.py
```

Access at `http://localhost:8501`

Features:
- Create new ebook projects
- Monitor generation progress
- Download DOCX/PDF exports
- View project history

### FastAPI Backend

```bash
python run_api.py
```

Access at `http://localhost:8765`

API documentation: `http://localhost:8765/docs`

### Running Both Services

```bash
# Terminal 1
streamlit run app/Home.py

# Terminal 2
python run_api.py
```

Or use the systemd service (see Deployment section).

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=term-missing

# Run specific test categories
pytest -m unit           # Unit tests only
pytest -m integration    # Integration tests only

# Run specific test file
pytest tests/test_pipeline/test_intake.py

# Run specific test
pytest tests/test_pipeline/test_intake.py::TestProjectIntake::test_create_project

# Lint code
ruff check src/
```

### Test Coverage

Current coverage: **78%** overall
- Security modules: **96-100%**
- Pipeline modules: **90%+**
- Test pass rate: **97.8%** (532/544 tests)

See `docs/testing.md` for detailed coverage analysis.

## Architecture

### Overview

```
User Input → Streamlit UI → Pipeline Orchestrator → AI Client (OmniRoute)
                ↓                                          ↓
           SQLite DB ← Job Queue ← Background Worker ← AI Stages
                ↓
         Project Files (projects/{id}/)
```

### Pipeline Stages

1. **ProjectIntake** - Validates input, creates project record
2. **StrategyPlanner** - Generates audience/tone/goal strategy
3. **OutlineGenerator** - Creates chapter structure with word counts
4. **ManuscriptEngine** - Generates chapter content sequentially
5. **QAEngine** - Validates structure and consistency
6. **ContentSafety** - Applies content filters and disclaimers
7. **CoverGenerator** - Creates cover image
8. **Export** - Generates DOCX and PDF files

### Key Components

- **AI Client** (`src/ai_client.py`) - OmniRoute proxy wrapper
- **Database** (`src/db/`) - SQLite with repositories pattern
- **Job Queue** (`src/jobs/`) - Background processing with threading
- **Pipeline** (`src/pipeline/`) - Modular generation stages
- **Export** (`src/export/`) - DOCX/PDF generation
- **API** (`src/api/`) - FastAPI REST endpoints
- **Utils** (`src/utils/`) - Error handling, path validation, logging

See `CLAUDE.md` for detailed architecture documentation.

## API Documentation

### Authentication

All API endpoints require the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:8765/api/projects
```

### Endpoints

**Create Project**
```bash
POST /api/projects
Content-Type: application/json

{
  "title": "My Ebook",
  "brief": "A comprehensive guide to...",
  "product_mode": "paid_ebook",
  "target_word_count": 15000
}
```

**Get Project Status**
```bash
GET /api/projects/{project_id}
```

**Download Export**
```bash
GET /api/projects/{project_id}/download?format=pdf
```

**List Projects**
```bash
GET /api/projects?status=completed&limit=10
```

See `docs/api.md` for complete API reference.

## Deployment

### Systemd Service (Production)

```bash
# Copy service files
sudo cp ebook-generator.service /etc/systemd/system/
sudo cp ebook-api.service /etc/systemd/system/

# Enable and start services
sudo systemctl enable ebook-generator ebook-api
sudo systemctl start ebook-generator ebook-api

# Check status
sudo systemctl status ebook-generator
sudo systemctl status ebook-api

# View logs
sudo journalctl -u ebook-generator -f
sudo journalctl -u ebook-api -f
```

### Docker (Alternative)

```bash
# Build image
docker-compose build

# Run services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/ebook.aitradepulse.com
server {
    listen 80;
    server_name ebook.aitradepulse.com;

    location / {
        proxy_pass http://localhost:8501;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:8765;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

See `docs/deployment.md` for detailed deployment guide.

## Project Structure

```
1ai-ebook/
├── app/                    # Streamlit UI pages
│   ├── Home.py            # Main entry point
│   └── pages/             # Multi-page app
├── src/                   # Application source
│   ├── ai_client.py       # OmniRoute client
│   ├── api/               # FastAPI backend
│   ├── db/                # Database layer
│   ├── pipeline/          # Generation stages
│   ├── export/            # DOCX/PDF generation
│   ├── cover/             # Cover image generation
│   ├── jobs/              # Background queue
│   └── utils/             # Utilities (error handling, validation)
├── tests/                 # Test suite (mirrors src/)
├── docs/                  # Documentation
├── projects/              # Generated ebook files (runtime)
├── data/                  # Job state (runtime)
├── .env.example           # Environment template
├── pyproject.toml         # Project metadata
├── CLAUDE.md              # Developer guide
└── AGENTS.md              # AI agent guide
```

## Security Features

Recent security hardening (April 2026):

- **SQL Injection Prevention**: Field whitelist validation
- **Path Traversal Protection**: Path validator utility
- **Input Validation**: Pydantic models with XSS/SQL pattern detection
- **Command Injection Prevention**: Safe subprocess calls
- **Rate Limiting**: IP-based throttling (10 req/min general, 2 req/min generation)
- **Security Headers**: HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- **API Authentication**: Required API key with secure generation
- **Structured Logging**: Correlation IDs for request tracing

See `docs/security.md` for security audit results.

## Troubleshooting

### PDF Export Fails

**Problem**: `FileNotFoundError: libreoffice not found`

**Solution**: Install LibreOffice
```bash
sudo apt install libreoffice  # Ubuntu/Debian
brew install libreoffice      # macOS
```

### OmniRoute Connection Error

**Problem**: `Connection refused to localhost:20128`

**Solution**: Start OmniRoute proxy or update `OMNIROUTE_BASE_URL` in `.env`

### API Returns 401 Unauthorized

**Problem**: Missing or invalid API key

**Solution**: Set `EBOOK_API_KEY` in `.env` and pass via `X-API-Key` header

### Tests Fail with Auth Errors

**Problem**: Integration tests return 401

**Solution**: Configure test API key in test environment (non-blocking for unit tests)

### Rate Limit Exceeded

**Problem**: `429 Too Many Requests`

**Solution**: Wait 60 seconds or adjust rate limits in `src/api/middleware.py`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pytest`)
5. Run linter (`ruff check src/`)
6. Commit changes (`git commit -m 'Add amazing feature'`)
7. Push to branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

- Follow PEP 8 conventions
- Use type hints for function signatures
- Write docstrings for public APIs
- Add tests for new features
- Maintain test coverage above 75%

### Testing Requirements

All PRs must:
- Pass all existing tests
- Add tests for new functionality
- Maintain or improve code coverage
- Pass `ruff check` linting

## License

[Add your license here]

## Support

- **Documentation**: See `docs/` directory
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)

## Acknowledgments

- Built with [Streamlit](https://streamlit.io/)
- AI orchestration via [OmniRoute](https://github.com/omniroute/omniroute)
- Document generation with [python-docx](https://python-docx.readthedocs.io/)
