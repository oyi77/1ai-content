# Deployment Guide

Complete deployment instructions for the AI Ebook Generator.

## Deployment Options

1. **Systemd Service** (Recommended for production)
2. **Docker Compose** (Containerized deployment)
3. **Manual Process** (Development/testing)

## Prerequisites

### System Requirements

- **OS**: Ubuntu 20.04+ / Debian 11+ / RHEL 8+
- **Python**: 3.11 or higher
- **Memory**: 2GB minimum, 4GB recommended
- **Disk**: 10GB minimum (for projects and database)
- **LibreOffice**: Required for PDF conversion

### Software Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip libreoffice nginx

# RHEL/CentOS
sudo dnf install -y python3.11 python3-pip libreoffice nginx
```

## Option 1: Systemd Service (Production)

### 1. Create Application User

```bash
sudo useradd -r -s /bin/bash -d /opt/ebook-generator ebook
sudo mkdir -p /opt/ebook-generator
sudo chown ebook:ebook /opt/ebook-generator
```

### 2. Install Application

```bash
# Switch to application user
sudo su - ebook

# Clone repository
cd /opt/ebook-generator
git clone https://github.com/your-org/1ai-ebook.git .

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e .
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Generate secure API key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Edit .env with production values
nano .env
```

**Production .env**:
```bash
# OmniRoute Configuration
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=your-omniroute-key

# API Security (REQUIRED)
EBOOK_API_KEY=your-generated-secure-key

# Application Ports
UI_PORT=8501
API_PORT=8765

# Optional: adforge Integration
ADFORGE_URL=https://adforge.example.com
ADFORGE_API_KEY=your-adforge-token

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# CORS (comma-separated origins)
ALLOWED_ORIGINS=https://ebook.aitradepulse.com
```

### 4. Install Systemd Services

**Streamlit UI Service** (`/etc/systemd/system/ebook-generator.service`):
```ini
[Unit]
Description=AI Ebook Generator - Streamlit UI
After=network.target

[Service]
Type=simple
User=ebook
Group=ebook
WorkingDirectory=/opt/ebook-generator
Environment="PATH=/opt/ebook-generator/.venv/bin"
ExecStart=/opt/ebook-generator/.venv/bin/streamlit run app/Home.py --server.port=8501 --server.address=127.0.0.1
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ebook-generator/projects /opt/ebook-generator/data

[Install]
WantedBy=multi-user.target
```

**FastAPI Backend Service** (`/etc/systemd/system/ebook-api.service`):
```ini
[Unit]
Description=AI Ebook Generator - FastAPI Backend
After=network.target

[Service]
Type=simple
User=ebook
Group=ebook
WorkingDirectory=/opt/ebook-generator
Environment="PATH=/opt/ebook-generator/.venv/bin"
ExecStart=/opt/ebook-generator/.venv/bin/python run_api.py
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ebook-generator/projects /opt/ebook-generator/data

[Install]
WantedBy=multi-user.target
```

### 5. Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable ebook-generator ebook-api

# Start services
sudo systemctl start ebook-generator ebook-api

# Check status
sudo systemctl status ebook-generator
sudo systemctl status ebook-api
```

### 6. Configure Nginx Reverse Proxy

**Nginx Configuration** (`/etc/nginx/sites-available/ebook.aitradepulse.com`):
```nginx
upstream streamlit {
    server 127.0.0.1:8501;
}

upstream api {
    server 127.0.0.1:8765;
}

server {
    listen 80;
    server_name ebook.aitradepulse.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ebook.aitradepulse.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/ebook.aitradepulse.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ebook.aitradepulse.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    
    # Streamlit UI
    location / {
        proxy_pass http://streamlit;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
    
    # FastAPI Backend
    location /api {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-running generation
        proxy_read_timeout 600;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://api/health;
        access_log off;
    }
}
```

### 7. Enable Nginx Configuration

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/ebook.aitradepulse.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 8. SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d ebook.aitradepulse.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

## Option 2: Docker Compose

### 1. Docker Compose Configuration

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  ebook-ui:
    build: .
    container_name: ebook-ui
    ports:
      - "8501:8501"
    environment:
      - OMNIROUTE_BASE_URL=${OMNIROUTE_BASE_URL}
      - OMNIROUTE_API_KEY=${OMNIROUTE_API_KEY}
      - EBOOK_API_KEY=${EBOOK_API_KEY}
    volumes:
      - ./projects:/app/projects
      - ./data:/app/data
    command: streamlit run app/Home.py --server.port=8501 --server.address=0.0.0.0
    restart: unless-stopped
    depends_on:
      - ebook-api

  ebook-api:
    build: .
    container_name: ebook-api
    ports:
      - "8765:8765"
    environment:
      - OMNIROUTE_BASE_URL=${OMNIROUTE_BASE_URL}
      - OMNIROUTE_API_KEY=${OMNIROUTE_API_KEY}
      - EBOOK_API_KEY=${EBOOK_API_KEY}
    volumes:
      - ./projects:/app/projects
      - ./data:/app/data
    command: python run_api.py
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: ebook-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ebook-ui
      - ebook-api
    restart: unless-stopped
```

### 2. Build and Run

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Option 3: Manual Process (Development)

### 1. Install Dependencies

```bash
# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install application
pip install -e .
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run Services

```bash
# Terminal 1: Streamlit UI
streamlit run app/Home.py

# Terminal 2: FastAPI Backend
python run_api.py
```

## Post-Deployment

### 1. Verify Installation

```bash
# Check service status
sudo systemctl status ebook-generator
sudo systemctl status ebook-api

# Check logs
sudo journalctl -u ebook-generator -f
sudo journalctl -u ebook-api -f

# Test health endpoint
curl http://localhost:8765/health

# Test API authentication
curl -H "X-API-Key: your-api-key" http://localhost:8765/api/projects
```

### 2. Create Test Project

```bash
curl -X POST http://localhost:8765/api/projects \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Ebook",
    "brief": "A test ebook to verify deployment",
    "product_mode": "paid_ebook",
    "target_word_count": 5000
  }'
```

### 3. Monitor Generation

```bash
# Get project status
curl -H "X-API-Key: your-api-key" \
  http://localhost:8765/api/projects/{project_id}

# Watch logs
sudo journalctl -u ebook-api -f | grep "project_id"
```

## Monitoring

### Log Management

**View Logs**:
```bash
# Systemd services
sudo journalctl -u ebook-generator -f
sudo journalctl -u ebook-api -f

# Docker
docker-compose logs -f ebook-ui
docker-compose logs -f ebook-api

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

**Log Rotation** (`/etc/logrotate.d/ebook-generator`):
```
/var/log/ebook-generator/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 ebook ebook
    sharedscripts
    postrotate
        systemctl reload ebook-generator ebook-api
    endscript
}
```

### Health Checks

**Systemd Health Check**:
```bash
#!/bin/bash
# /opt/ebook-generator/health-check.sh

API_KEY="your-api-key"
HEALTH_URL="http://localhost:8765/health"

response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$response" != "200" ]; then
    echo "Health check failed: HTTP $response"
    systemctl restart ebook-api
    exit 1
fi

echo "Health check passed"
exit 0
```

**Cron Job** (run every 5 minutes):
```bash
*/5 * * * * /opt/ebook-generator/health-check.sh >> /var/log/ebook-health.log 2>&1
```

### Performance Monitoring

**System Metrics**:
```bash
# CPU and memory usage
htop

# Disk usage
df -h /opt/ebook-generator/projects

# Database size
du -h /opt/ebook-generator/ebooks.db

# Active connections
ss -tulpn | grep -E '8501|8765'
```

## Backup and Recovery

### Database Backup

```bash
#!/bin/bash
# /opt/ebook-generator/backup-db.sh

BACKUP_DIR="/opt/ebook-generator/backups"
DB_PATH="/opt/ebook-generator/ebooks.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# SQLite backup
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/ebooks_$DATE.db'"

# Compress
gzip "$BACKUP_DIR/ebooks_$DATE.db"

# Keep last 30 days
find "$BACKUP_DIR" -name "ebooks_*.db.gz" -mtime +30 -delete

echo "Backup completed: ebooks_$DATE.db.gz"
```

**Cron Job** (daily at 2 AM):
```bash
0 2 * * * /opt/ebook-generator/backup-db.sh >> /var/log/ebook-backup.log 2>&1
```

### Project Files Backup

```bash
#!/bin/bash
# /opt/ebook-generator/backup-projects.sh

BACKUP_DIR="/opt/ebook-generator/backups"
PROJECTS_DIR="/opt/ebook-generator/projects"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Tar and compress
tar -czf "$BACKUP_DIR/projects_$DATE.tar.gz" -C "$PROJECTS_DIR" .

# Keep last 7 days
find "$BACKUP_DIR" -name "projects_*.tar.gz" -mtime +7 -delete

echo "Backup completed: projects_$DATE.tar.gz"
```

### Restore from Backup

```bash
# Stop services
sudo systemctl stop ebook-generator ebook-api

# Restore database
gunzip -c /opt/ebook-generator/backups/ebooks_20260421_020000.db.gz > /opt/ebook-generator/ebooks.db

# Restore projects
tar -xzf /opt/ebook-generator/backups/projects_20260421_020000.tar.gz -C /opt/ebook-generator/projects

# Fix permissions
sudo chown -R ebook:ebook /opt/ebook-generator/projects
sudo chown ebook:ebook /opt/ebook-generator/ebooks.db

# Start services
sudo systemctl start ebook-generator ebook-api
```

## Scaling

### Horizontal Scaling

For high-traffic deployments:

1. **Load Balancer**: Use Nginx or HAProxy
2. **Multiple API Instances**: Run multiple FastAPI workers
3. **Shared Storage**: Use NFS or S3 for project files
4. **Database**: Migrate to PostgreSQL for better concurrency

### Vertical Scaling

Increase resources for single instance:

```bash
# Increase worker processes (run_api.py)
uvicorn src.api.server:app --workers 4 --host 0.0.0.0 --port 8765
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u ebook-api -n 50

# Common issues:
# 1. Missing .env file
# 2. Invalid API key
# 3. Port already in use
# 4. Permission issues

# Fix permissions
sudo chown -R ebook:ebook /opt/ebook-generator
```

### PDF Conversion Fails

```bash
# Check LibreOffice installation
which libreoffice
libreoffice --version

# Install if missing
sudo apt install -y libreoffice

# Test conversion manually
libreoffice --headless --convert-to pdf test.docx
```

### High Memory Usage

```bash
# Check memory usage
free -h

# Restart services to clear memory
sudo systemctl restart ebook-generator ebook-api

# Adjust worker count if needed
```

## Security Checklist

- [ ] HTTPS enabled with valid SSL certificate
- [ ] Strong API key generated (32+ characters)
- [ ] `.env` file permissions set to 600
- [ ] Firewall configured (only 80/443 open)
- [ ] Regular security updates applied
- [ ] Log monitoring configured
- [ ] Backup system tested
- [ ] Rate limiting verified
- [ ] CORS origins restricted
- [ ] Database backups encrypted

## See Also

- [Architecture Overview](architecture.md)
- [API Documentation](api.md)
- [Security Features](security.md)
- [Testing Strategy](testing.md)
