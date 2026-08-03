#!/bin/bash
# Test Ecosystem Integration Flow
# Tests the integration between 1ai-content, 1ai-social, and 1ai-affiliate

set -e

echo "🧪 Testing Ecosystem Integration Flow"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Service URLs
CONTENT_URL="http://127.0.0.1:3002"
SOCIAL_URL="http://127.0.0.1:8200"
AFFILIATE_URL="http://127.0.0.1:3001"

# API key (must match ECOSYSTEM_API_KEY in .env — the bot requires it,
# src/routes/ecosystem.ts reads it via env at startup)
API_KEY="${ECOSYSTEM_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "ERROR: ECOSYSTEM_API_KEY is not set — export it (same value as .env) before running."
  exit 1
fi

# ══════════════════════════════════════════════════════════════════════
# Helper Functions
# ══════════════════════════════════════════════════════════════════════

check_service() {
  local name=$1
  local url=$2
  
  echo -n "Checking $name... "
  if curl -s -f "$url/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
    return 0
  else
    echo -e "${RED}✗ Unreachable${NC}"
    return 1
  fi
}

test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4
  local expected_status=$5
  
  echo -n "Testing $name... "
  
  local timestamp=$(date +%s)000
  local signature=$(echo -n "1ai-content:${timestamp}:${data}" | openssl dgst -sha256 -hmac "$API_KEY" | awk '{print $2}')
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$url" \
      -H "X-Api-Key: $API_KEY" \
      -H "X-Service-Name: 1ai-content" \
      -H "X-Timestamp: $timestamp" \
      -H "X-Signature: $signature")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
      -H "Content-Type: application/json" \
      -H "X-Api-Key: $API_KEY" \
      -H "X-Service-Name: 1ai-content" \
      -H "X-Timestamp: $timestamp" \
      -H "X-Signature: $signature" \
      -d "$data")
  fi
  
  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}✓ Status $status${NC}"
    return 0
  else
    echo -e "${RED}✗ Expected $expected_status, got $status${NC}"
    echo "  Response: $body"
    return 1
  fi
}

# ══════════════════════════════════════════════════════════════════════
# Test Suite
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "1. Service Health Checks"
echo "------------------------"

check_service "1ai-content" "$CONTENT_URL"
check_service "1ai-social" "$SOCIAL_URL"
check_service "1ai-affiliate" "$AFFILIATE_URL"

echo ""
echo "2. Ecosystem Status Endpoint"
echo "----------------------------"

test_endpoint "Ecosystem Status" "GET" "$CONTENT_URL/api/ecosystem/status" "" "200"

echo ""
echo "3. Content Publisher Endpoint"
echo "-----------------------------"

PUBLISH_DATA='{
  "user_id": "test_user_123",
  "media_url": "https://example.com/test-video.mp4",
  "media_type": "video",
  "caption": "Test caption for integration test",
  "platforms": ["facebook", "instagram"],
  "inject_affiliate_link": true,
  "campaign_id": "test_campaign"
}'

test_endpoint "Social Publish" "POST" "$SOCIAL_URL/api/content/publish" "$PUBLISH_DATA" "200"

echo ""
echo "4. Affiliate Link Generation"
echo "-----------------------------"

AFFILIATE_DATA='{
  "user_id": "test_user_123",
  "destination_url": "https://example.com/product",
  "campaign_id": "test_campaign"
}'

test_endpoint "Generate Link" "POST" "$AFFILIATE_URL/api/affiliate/generate-link" "$AFFILIATE_DATA" "200"

echo ""
echo "5. Conversion Webhook"
echo "----------------------"

CONVERSION_DATA='{
  "tracking_id": "test_tracking_123",
  "user_id": "test_user_123",
  "conversion_type": "purchase",
  "revenue": 50000,
  "currency": "IDR",
  "commission": 5000,
  "campaign_id": "test_campaign",
  "platform": "facebook"
}'

test_endpoint "Conversion Webhook" "POST" "$AFFILIATE_URL/api/affiliate/conversion" "$CONVERSION_DATA" "200"

echo ""
echo "6. Conversion Update Webhook"
echo "-----------------------------"

CONVERSION_UPDATE_DATA='{
  "clickId": "test_click_123",
  "trackingId": "test_tracking_123",
  "userId": "test_user_123",
  "conversionType": "purchase",
  "revenue": 50000,
  "currency": "IDR",
  "commission": 5000,
  "campaignId": "test_campaign",
  "platform": "facebook"
}'

test_endpoint "Conversion Update" "POST" "$CONTENT_URL/webhook/conversion-update" "$CONVERSION_UPDATE_DATA" "200"

echo ""
echo "======================================"
echo -e "${GREEN}✓ All integration tests passed!${NC}"
echo ""
