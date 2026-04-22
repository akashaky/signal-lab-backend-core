#!/bin/bash

# Billing API Test Script
# Usage: ./test-billing-api.sh <your_jwt_token>

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_BASE="https://dev-api.revsignallab.com"
TOKEN=$1

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Error: JWT token required${NC}"
    echo "Usage: ./test-billing-api.sh <your_jwt_token>"
    exit 1
fi

echo -e "${BLUE}=== Testing Billing API ===${NC}\n"

# Test 1: Get Billing Status
echo -e "${GREEN}1. GET /api/billing/status${NC}"
curl -s -X GET "$API_BASE/api/billing/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

# Test 2: Get Available Plans
echo -e "${GREEN}2. GET /api/billing/plans${NC}"
curl -s -X GET "$API_BASE/api/billing/plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

# Test 3: Start Trial
echo -e "${GREEN}3. POST /api/billing/start-trial${NC}"
read -p "Start trial? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    curl -s -X POST "$API_BASE/api/billing/start-trial" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" | jq '.'
    echo -e "\n"
fi

# Test 4: Get Billing Status Again
echo -e "${GREEN}4. GET /api/billing/status (after trial)${NC}"
curl -s -X GET "$API_BASE/api/billing/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

# Test 5: Subscribe
echo -e "${GREEN}5. POST /api/billing/subscribe${NC}"
read -p "Subscribe with payment method? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    curl -s -X POST "$API_BASE/api/billing/subscribe" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"paymentMethodId": "pm_test_'$(date +%s)'"}' | jq '.'
    echo -e "\n"
fi

# Test 6: Get Billing History
echo -e "${GREEN}6. GET /api/billing/history${NC}"
curl -s -X GET "$API_BASE/api/billing/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

# Test 7: Cancel Subscription
echo -e "${GREEN}7. POST /api/billing/cancel${NC}"
read -p "Cancel subscription? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Cancel immediately? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        IMMEDIATE="true"
    else
        IMMEDIATE="false"
    fi
    
    curl -s -X POST "$API_BASE/api/billing/cancel" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"immediate\": $IMMEDIATE}" | jq '.'
    echo -e "\n"
fi

# Test 8: Final Status Check
echo -e "${GREEN}8. GET /api/billing/status (final)${NC}"
curl -s -X GET "$API_BASE/api/billing/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

echo -e "${BLUE}=== Testing Complete ===${NC}"
