# API Documentation

Complete REST API reference for the AI Ebook Generator.

## Base URL

- **Development**: `http://localhost:8765`
- **Production**: `https://ebook.aitradepulse.com/api`

## Authentication

All API endpoints require authentication via the `X-API-Key` header.

```bash
curl -H "X-API-Key: your-api-key-here" http://localhost:8765/api/projects
```

### Getting an API Key

Set `EBOOK_API_KEY` in your `.env` file:

```bash
# Generate a secure key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Add to .env
EBOOK_API_KEY=your-generated-key-here
```

## Rate Limits

- **General endpoints**: 10 requests per minute per IP
- **Generation endpoints**: 2 requests per minute per IP

Rate limit headers included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Endpoints

### Health Check

Check API availability.

**Endpoint**: `GET /health`

**Authentication**: Not required

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-21T11:03:57.847Z"
}
```

---

### Create Project

Create a new ebook generation project.

**Endpoint**: `POST /api/projects`

**Authentication**: Required

**Request Body**:
```json
{
  "title": "The Complete Guide to AI",
  "brief": "A comprehensive guide covering AI fundamentals, machine learning, and practical applications for beginners.",
  "product_mode": "paid_ebook",
  "target_word_count": 15000,
  "chapter_count": 10,
  "target_language": "en",
  "quality_level": "standard"
}
```

**Field Validation**:
- `title`: 1-200 characters (optional, generated if not provided)
- `brief`: 10-5000 characters (required)
- `product_mode`: `lead_magnet`, `paid_ebook`, `bonus_content`, `authority` (optional, default: `paid_ebook`)
- `target_word_count`: 3000-50000 (optional, default: 15000)
- `chapter_count`: 3-50 (optional, default: 10)
- `target_language`: ISO 639-1 code (optional, default: `en`)
- `quality_level`: `draft`, `standard`, `premium` (optional, default: `standard`)

**Response** (201 Created):
```json
{
  "project_id": "proj_abc123def456",
  "status": "generating",
  "created_at": "2026-04-21T11:03:57.847Z"
}
```

**Error Responses**:

400 Bad Request - Invalid input:
```json
{
  "detail": "Invalid input: brief must be between 10 and 5000 characters"
}
```

401 Unauthorized - Missing or invalid API key:
```json
{
  "detail": "Invalid API key"
}
```

429 Too Many Requests - Rate limit exceeded:
```json
{
  "detail": "Rate limit exceeded. Try again in 60 seconds."
}
```

---

### Get Project

Retrieve project details and status.

**Endpoint**: `GET /api/projects/{project_id}`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "id": "proj_abc123def456",
  "title": "The Complete Guide to AI",
  "status": "completed",
  "product_mode": "paid_ebook",
  "target_word_count": 15000,
  "chapter_count": 10,
  "created_at": "2026-04-21T11:03:57.847Z",
  "updated_at": "2026-04-21T11:15:32.123Z",
  "progress": {
    "current_stage": "export",
    "percent_complete": 100,
    "message": "Export complete"
  }
}
```

**Status Values**:
- `draft`: Project created, not yet started
- `generating`: Generation in progress
- `completed`: Successfully generated
- `failed`: Generation failed

**Error Responses**:

404 Not Found - Project doesn't exist:
```json
{
  "detail": "Project not found"
}
```

---

### List Projects

List all projects with optional filtering.

**Endpoint**: `GET /api/projects`

**Authentication**: Required

**Query Parameters**:
- `status`: Filter by status (`draft`, `generating`, `completed`, `failed`)
- `product_mode`: Filter by product mode
- `limit`: Maximum results (default: 50, max: 100)
- `offset`: Pagination offset (default: 0)

**Example**:
```bash
GET /api/projects?status=completed&limit=10&offset=0
```

**Response** (200 OK):
```json
{
  "projects": [
    {
      "id": "proj_abc123",
      "title": "The Complete Guide to AI",
      "status": "completed",
      "created_at": "2026-04-21T11:03:57.847Z"
    },
    {
      "id": "proj_def456",
      "title": "Marketing Automation Handbook",
      "status": "generating",
      "created_at": "2026-04-21T10:30:12.456Z"
    }
  ],
  "total": 2,
  "limit": 10,
  "offset": 0
}
```

---

### Download Export

Download generated DOCX or PDF file.

**Endpoint**: `GET /api/projects/{project_id}/download`

**Authentication**: Required

**Query Parameters**:
- `format`: `docx` or `pdf` (required)

**Example**:
```bash
GET /api/projects/proj_abc123/download?format=pdf
```

**Response** (200 OK):
- **Content-Type**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX) or `application/pdf` (PDF)
- **Content-Disposition**: `attachment; filename="ebook.pdf"`
- **Body**: Binary file content

**Error Responses**:

400 Bad Request - Invalid format:
```json
{
  "detail": "Invalid format. Must be 'docx' or 'pdf'"
}
```

404 Not Found - File doesn't exist:
```json
{
  "detail": "Export file not found. Project may not be completed."
}
```

403 Forbidden - Path traversal attempt:
```json
{
  "detail": "Invalid file path"
}
```

---

### Delete Project

Delete a project and all associated files.

**Endpoint**: `DELETE /api/projects/{project_id}`

**Authentication**: Required

**Response** (204 No Content):
No response body.

**Error Responses**:

404 Not Found - Project doesn't exist:
```json
{
  "detail": "Project not found"
}
```

---

### Get Available Models

List available AI models from OmniRoute.

**Endpoint**: `GET /api/models`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "models": [
    {
      "id": "auto/free-chat",
      "name": "Auto Free Chat",
      "provider": "omniroute"
    },
    {
      "id": "auto/best-chat",
      "name": "Auto Best Chat",
      "provider": "omniroute"
    }
  ]
}
```

---

## Webhooks

Configure webhooks to receive notifications when projects complete.

### Webhook Configuration

Set webhook URL in project creation:

```json
{
  "title": "My Ebook",
  "brief": "...",
  "webhook_url": "https://your-app.com/webhooks/ebook-complete"
}
```

### Webhook Payload

POST request sent when project completes:

```json
{
  "event": "project.completed",
  "project_id": "proj_abc123",
  "status": "completed",
  "timestamp": "2026-04-21T11:15:32.123Z",
  "exports": {
    "docx": "https://ebook.aitradepulse.com/api/projects/proj_abc123/download?format=docx",
    "pdf": "https://ebook.aitradepulse.com/api/projects/proj_abc123/download?format=pdf"
  }
}
```

### Webhook Retry Logic

- **Max Retries**: 3 attempts
- **Backoff**: Exponential (1s, 2s, 4s)
- **Timeout**: 10 seconds per attempt
- **Retry Conditions**: Network errors, timeouts, HTTP 5xx

---

## Error Handling

### Standard Error Response

All errors follow this format:

```json
{
  "detail": "Human-readable error message",
  "error_type": "ValidationError",
  "correlation_id": "req_abc123def456"
}
```

### HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `204 No Content`: Successful deletion
- `400 Bad Request`: Invalid input or parameters
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Access denied (e.g., path traversal)
- `404 Not Found`: Resource doesn't exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error (check logs)

### Correlation IDs

Every response includes a correlation ID for tracing:

```
X-Correlation-ID: req_abc123def456
```

Use this ID when reporting issues or checking logs.

---

## Code Examples

### Python

```python
import requests

API_KEY = "your-api-key-here"
BASE_URL = "http://localhost:8765"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Create project
response = requests.post(
    f"{BASE_URL}/api/projects",
    headers=headers,
    json={
        "title": "My Ebook",
        "brief": "A comprehensive guide to...",
        "product_mode": "paid_ebook",
        "target_word_count": 15000
    }
)

project = response.json()
project_id = project["project_id"]

# Check status
response = requests.get(
    f"{BASE_URL}/api/projects/{project_id}",
    headers=headers
)

status = response.json()
print(f"Status: {status['status']}")

# Download PDF
response = requests.get(
    f"{BASE_URL}/api/projects/{project_id}/download?format=pdf",
    headers=headers
)

with open("ebook.pdf", "wb") as f:
    f.write(response.content)
```

### cURL

```bash
# Create project
curl -X POST http://localhost:8765/api/projects \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Ebook",
    "brief": "A comprehensive guide to...",
    "product_mode": "paid_ebook",
    "target_word_count": 15000
  }'

# Get project status
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:8765/api/projects/proj_abc123

# Download PDF
curl -H "X-API-Key: your-api-key-here" \
  -o ebook.pdf \
  "http://localhost:8765/api/projects/proj_abc123/download?format=pdf"
```

### JavaScript (Node.js)

```javascript
const axios = require('axios');

const API_KEY = 'your-api-key-here';
const BASE_URL = 'http://localhost:8765';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json'
};

// Create project
const response = await axios.post(
  `${BASE_URL}/api/projects`,
  {
    title: 'My Ebook',
    brief: 'A comprehensive guide to...',
    product_mode: 'paid_ebook',
    target_word_count: 15000
  },
  { headers }
);

const projectId = response.data.project_id;

// Check status
const status = await axios.get(
  `${BASE_URL}/api/projects/${projectId}`,
  { headers }
);

console.log(`Status: ${status.data.status}`);

// Download PDF
const pdf = await axios.get(
  `${BASE_URL}/api/projects/${projectId}/download?format=pdf`,
  { headers, responseType: 'arraybuffer' }
);

require('fs').writeFileSync('ebook.pdf', pdf.data);
```

---

## See Also

- [Architecture Overview](architecture.md)
- [Security Features](security.md)
- [Deployment Guide](deployment.md)
