# 04 — API Reference

## Base URL

- **Production:** `https://content.aitradepulse.com`
- **Local:** `http://localhost:3000`

## Authentication

| Auth Method | Used By | Header/Cookie |
|-------------|---------|---------------|
| Telegram ID | Bot commands | `ctx.from.id` |
| Password + JWT | Admin dashboard | `admin_token` cookie |
| HMAC-SHA256 | Ecosystem webhooks | `X-Service-Key`, `X-Signature` |
| Webhook Signature | Payment gateways | Provider-specific |

## Admin Routes

### Dashboard
```
GET  /admin/login          → Login page
POST /admin/login          → Authenticate (password)
GET  /admin/dashboard      → Main dashboard (JWT required)
GET  /admin/pricing        → Pricing config page
GET  /admin/providers      → Provider management
GET  /admin/settings       → System settings
GET  /admin/users          → User management
GET  /admin/playground     → AI testing playground
GET  /admin/medias         → Media gallery
GET  /admin/prompts        → Prompt management
GET  /admin/ai-config      → AI configuration
GET  /admin/dynamic-pricing → Dynamic pricing
GET  /admin/personas       → Bot personas
GET  /admin/interceptions  → User interceptions
```

### Admin API
```
GET  /api/admin/stats                  → System statistics
GET  /api/admin/providers/all          → All providers with health
GET  /api/admin/providers/balances     → Provider balances
POST /api/admin/providers/:key/reset-cb → Reset circuit breaker
GET  /api/admin/settings/providers     → Provider overrides
POST /api/admin/settings/providers     → Update provider overrides
GET  /api/admin/sse                    → Server-sent events (real-time)
```

### Admin Config API
```
GET    /api/admin-config                    → All config values
PUT    /api/admin-config/:category/:key     → Update config
DELETE /api/admin-config/:category/:key     → Delete config
GET    /api/admin/api-keys                  → List API keys
PUT    /api/admin/api-keys/:name            → Create/update API key
DELETE /api/admin/api-keys/:name            → Delete API key
```

## Webhook Routes

### Payment Webhooks
```
POST /webhook/midtrans    → Midtrans notification
POST /webhook/tripay      → Tripay callback
POST /webhook/duitku      → Duitku callback
POST /webhook/nowpayments  → NOWPayments IPN
```

### Ecosystem Webhooks
```
POST /webhook/publish-result    → From 1ai-social (publish results)
POST /webhook/conversion-update → From 1ai-affiliate (conversions)
```

### Health & Status
```
GET /health                    → Basic health check
GET /api/ecosystem/status      → Ecosystem service health
```

## Content API

```
POST /api/content/generate   → Generate content (authenticated)
GET  /api/content/status/:id → Check generation status
GET  /api/content/download/:id → Download generated content
```

## Request/Response Examples

### Admin Login
```http
POST /admin/login
Content-Type: application/json

{
  "password": "your-password"
}

Response:
{
  "success": true
}

Set-Cookie: admin_token=<jwt>; Path=/; HttpOnly
```

### Ecosystem Status
```http
GET /api/ecosystem/status

Response:
{
  "ecosystem": "1ai",
  "services": {
    "social": {
      "name": "1ai-social",
      "status": "healthy",
      "latency": 106
    },
    "affiliate": {
      "name": "1ai-affiliate",
      "status": "healthy",
      "latency": 75
    }
  },
  "timestamp": "2026-06-24T05:46:48.582Z"
}
```

### Publish Content
```http
POST /api/content/publish
X-Service-Key: your-key
X-Service-Name: 1ai-content
X-Timestamp: 1719216000000
X-Signature: hmac-sha256-signature

{
  "user_id": "123456789",
  "media_url": "https://cdn.example.com/video.mp4",
  "media_type": "video",
  "caption": "Check out this product!",
  "platforms": ["facebook", "instagram"],
  "inject_affiliate_link": true
}

Response:
{
  "success": true,
  "results": [
    {
      "platform": "facebook",
      "success": true,
      "post_id": "fb_123",
      "post_url": "https://facebook.com/posts/123"
    }
  ],
  "published": 1,
  "failed": 0
}
```

## Error Responses

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (invalid credentials) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Internal server error |

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Admin login | 5 attempts | 15 minutes |
| Content generation | 10 requests | 1 hour |
| Webhooks | No limit | - |
| Admin API | 100 requests | 1 minute |
