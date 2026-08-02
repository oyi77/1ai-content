#!/bin/bash
# =============================================================================
# 1AI-CONTENT — DEPLOYMENT SCRIPT
# =============================================================================
# Real runtime model (see AGENTS.md):
#   - Bot TS   : PM2 app `1ai-content`, port :3002
#   - Media API: systemd unit `1ai-content.service`, port :8767 (loopback)
#   - Frontend : static admin-ui/dist served by the bot
# This script builds everything, then reloads the two supervisors and verifies
# with scripts/health-check.sh. It intentionally does NOT do docker/k8s/git tag.
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =============================================================================
# CONFIGURATION
# =============================================================================

ENVIRONMENT=""
SKIP_TESTS=false
SKIP_BUILD=false
FORCE=false

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# =============================================================================
# HELPERS
# =============================================================================

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment    Target environment (development|staging|production)"
    echo "  --skip-tests         Skip running tests"
    echo "  --skip-build         Skip build step"
    echo "  -f, --force          Skip confirmation prompt"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e production"
    echo "  $0 -e production --skip-tests -f"
}

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
            --skip-tests)     SKIP_TESTS=true; shift ;;
            --skip-build)     SKIP_BUILD=true; shift ;;
            -f|--force)       FORCE=true; shift ;;
            -h|--help)        print_usage; exit 0 ;;
            *)                log_error "Unknown option: $1"; print_usage; exit 1 ;;
        esac
    done
}

validate_environment() {
    if [ -z "$ENVIRONMENT" ]; then
        log_error "Environment is required"
        print_usage
        exit 1
    fi
    case $ENVIRONMENT in
        development|staging|production) ;;
        *) log_error "Invalid environment: $ENVIRONMENT"; exit 1 ;;
    esac
}

confirm_deployment() {
    if [ "$FORCE" = true ]; then
        return 0
    fi
    echo ""
    log_warning "You are about to deploy to ${YELLOW}$ENVIRONMENT${NC}"
    read -r -p "Are you sure? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Deployment cancelled"
        exit 0
    fi
}

# =============================================================================
# BUILD & TEST
# =============================================================================

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        log_warning "Skipping tests"
        return 0
    fi
    log_info "Running jest (bot TS)..."
    (cd "$REPO_ROOT" && npm test)
    log_info "Running pytest (media-api)..."
    (cd "$REPO_ROOT/services" && python3 -m pytest tests/test_api_health.py test_reka.py -q)
    log_success "All tests passed"
}

run_build() {
    if [ "$SKIP_BUILD" = true ]; then
        log_warning "Skipping build"
        return 0
    fi
    log_info "Building bot TS (tsc -> dist/)..."
    (cd "$REPO_ROOT" && npm run build)
    log_info "Building admin-ui (vite -> admin-ui/dist/)..."
    (cd "$REPO_ROOT/admin-ui" && npm run build)
    log_success "Build completed"
}

# =============================================================================
# DEPLOY
# =============================================================================

deploy_production() {
    log_info "Deploying to PRODUCTION..."

    # 1. Bot TS via PM2 (app `1ai-content`, :3002)
    if command -v pm2 &>/dev/null; then
        log_info "Reloading PM2 app 1ai-content..."
        pm2 reload 1ai-content --update-env || pm2 restart 1ai-content --update-env
        pm2 save || true
    else
        log_warning "pm2 not found — skipping bot reload (dev only)"
    fi

    # 2. Media API via systemd (unit `1ai-content.service`, :8767)
    if command -v systemctl &>/dev/null && systemctl list-unit-files | grep -q '^1ai-content.service'; then
        log_info "Restarting systemd unit 1ai-content.service (media-api)..."
        sudo systemctl restart 1ai-content.service
    else
        log_warning "systemd unit 1ai-content.service not found — skipping media-api restart (dev only)"
    fi

    log_success "Production deployment completed"
}

# =============================================================================
# MAIN
# =============================================================================

parse_args "$@"
validate_environment
confirm_deployment

case $ENVIRONMENT in
    development)
        run_tests
        run_build
        log_success "Development build ready"
        log_info "Start with: npm run dev"
        ;;
    staging)
        run_tests
        run_build
        log_success "Staging build verified (no runtime touched)"
        ;;
    production)
        run_tests
        run_build
        deploy_production
        log_info "Running health checks..."
        (cd "$REPO_ROOT" && bash scripts/health-check.sh) || log_error "Health check reported failures"
        ;;
esac

echo ""
log_success "Deployment process completed!"
