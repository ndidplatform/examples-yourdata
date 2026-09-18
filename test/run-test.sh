#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# NDID Your Data — end-to-end test script
#
# Tests two AS nodes:
#   as1 (example1) — deposit data    :10000 callback :6002  NDID API :8300
#   as2 (example2) — deposit only     :11000 callback :6003  NDID API :8400
#
# Run from the repo root:
#   bash test/run-test.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()      { echo -e "${GREEN}✓ $*${NC}"; }
fail()    { echo -e "${RED}✗ $*${NC}"; exit 1; }
info()    { echo -e "${YELLOW}▶ $*${NC}"; }
section() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ── Kill any stale processes from previous runs ───────────────────────────────

info "Cleaning up stale processes..."
# Kill anything on the ports we need (mock API + service ports + callback ports)
for port in 8100 8200 8300 8400 8000 9000 10000 11000 6000 6001 6002 6003; do
  lsof -ti tcp:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 1
ok "Ports cleared"

# ── Build (if needed) ─────────────────────────────────────────────────────────

info "Building services..."
# #19: external_crypto_service is not part of this example flow — skip its build.
for svc in idp rp; do
  dir="$ROOT/$svc/example1"
  if [ ! -d "$dir/build" ] || [ "$dir/src" -nt "$dir/build" ]; then
    (cd "$dir" && npm run build --silent) && ok "$svc built" || fail "$svc build failed"
  else
    ok "$svc already built"
  fi
done

for example in as/example1 as/example2; do
  dir="$ROOT/$example"
  if [ ! -d "$dir/build" ] || [ "$dir/src" -nt "$dir/build" ]; then
    (cd "$dir" && npm run build --silent) && ok "$example built" || fail "$example build failed"
  else
    ok "$example already built"
  fi
done

# ── Start mock NDID API ───────────────────────────────────────────────────────

info "Starting mock NDID API..."
node "$SCRIPT_DIR/mock-ndid-api.js" &
MOCK_PID=$!

# Kill all background processes when the script exits (success or failure)
trap 'kill $(jobs -p) 2>/dev/null; wait 2>/dev/null' EXIT

sleep 1
curl -sf http://localhost:8100/v7/utility/idp > /dev/null || fail "Mock API failed to start"
ok "Mock API running (pid $MOCK_PID)"

# ── Start services ────────────────────────────────────────────────────────────

info "Starting IDP..."
NDID_API_CALLBACK_IP=localhost NDID_API_CALLBACK_PORT=6000 \
  API_SERVER_ADDRESS=http://localhost:8100 SERVER_PORT=8000 \
  node "$ROOT/idp/example1/build/server.js" &> /tmp/ydtest-idp.log &

info "Starting RP..."
NDID_API_CALLBACK_IP=localhost NDID_API_CALLBACK_PORT=6001 \
  API_SERVER_ADDRESS=http://localhost:8200 SERVER_PORT=9000 \
  node "$ROOT/rp/example1/build/server.js" &> /tmp/ydtest-rp.log &

info "Starting AS1 (deposit)..."
NDID_API_CALLBACK_IP=localhost NDID_API_CALLBACK_PORT=6002 \
  API_SERVER_ADDRESS=http://localhost:8300 SERVER_PORT=10000 \
  node "$ROOT/as/example1/build/server.js" &> /tmp/ydtest-as1.log &

info "Starting AS2 (deposit only)..."
NDID_API_CALLBACK_IP=localhost NDID_API_CALLBACK_PORT=6003 \
  API_SERVER_ADDRESS=http://localhost:8400 SERVER_PORT=11000 \
  node "$ROOT/as/example2/build/server.js" &> /tmp/ydtest-as2.log &

info "Waiting for services to register (8s)..."
sleep 8

# ── Health checks ─────────────────────────────────────────────────────────────

info "Health checks..."
curl -sf http://localhost:8000/health  > /dev/null && ok "IDP healthy"  || fail "IDP not healthy"
curl -sf http://localhost:9000/health  > /dev/null && ok "RP healthy"   || fail "RP not healthy"   # #22
curl -sf http://localhost:10000/health > /dev/null && ok "AS1 healthy"  || fail "AS1 not healthy"
curl -sf http://localhost:11000/health > /dev/null && ok "AS2 healthy"  || fail "AS2 not healthy"

# ── Helper ────────────────────────────────────────────────────────────────────

json_field() { echo "$1" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).$2||'')"; }

# ─────────────────────────────────────────────────────────────────────────────
section "DEPOSIT FLOW (AS1)"
# ─────────────────────────────────────────────────────────────────────────────

# ── Step 1: Register identity ─────────────────────────────────────────────────

echo ""
info "Step 1 — Register identity"
IDENTITY=$(curl -sf -X POST http://localhost:8000/identity \
  -H "Content-Type: application/json" \
  -d '{"namespace":"citizen_id","identifier":"1234567890123","mode":3}')
REQ_ID=$(json_field "$IDENTITY" request_id)
ACC_ID=$(json_field "$IDENTITY" accessor_id)
ok "Identity registered  request_id=$REQ_ID  accessor_id=$ACC_ID"
sleep 2

# ── Step 2: Pre-consent (deposit, via AS1) ────────────────────────────────────

echo ""
info "Step 2 — Pre-consent (deposit accounts)"
# request_params carries usage_type + data_service_list — AS embeds these in
# the as_token itself; the RP server (not this client) reads them back at
# complete-consent time.
PC=$(curl -sf -X POST http://localhost:9000/pre-consent/create \
  -H "Content-Type: application/json" \
  -d '{"namespace":"citizen_id","identifier":"1234567890123","data_request_list":[{"service_id":"900.pre_consent_deposit_001","request_params":"{\"usage_type\":\"continuous_with_expire\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_basic_001\"},{\"service_id\":\"900.deposit_transactions_detail_001\"},{\"service_id\":\"900.deposit_transactions_basic_002\"}]}"}]}')
PC_ID=$(json_field "$PC" request_id)
ok "Pre-consent created  request_id=$PC_ID"

echo "  Waiting for flow to complete (6s)..."
sleep 6

# The RP server keeps the as_token server-side — GET /pre-consent/data
# never includes it.
PC_DATA=$(curl -sf "http://localhost:9000/pre-consent/data/$PC_ID")
echo "$PC_DATA" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d = JSON.parse(arr[0].data || '{}');
  if (d.authorization !== undefined) { console.error('authorization leaked to client!'); process.exit(1); }
  if (!Array.isArray(d.sub_identity_list) || d.sub_identity_list.length === 0) { console.error('sub_identity_list missing'); process.exit(1); }
" && ok "Pre-consent response has no as_token (RP keeps it server-side)" || fail "as_token leaked, or sub_identity_list missing"

echo ""
echo "  Deposit pre-consent data:"
echo "$PC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  arr.forEach(a => {
    const d=JSON.parse(a.data||'{}');
    console.log('  ['+a.service_id+'] accounts:', (d.sub_identity_list||[]).map(x=>x.visible_identifier).join(', '));
  });
"

# ── Step 3: Complete-consent (AS1) ───────────────────────────────────────────

echo ""
info "Step 3 — Complete-consent (deposit)"
# No as_token is sent — the RP resolves it from pre_consent_request_id + as_node_id.
CC=$(curl -sf -X POST http://localhost:9000/complete-consent/create \
  -H "Content-Type: application/json" \
  -d "{\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"pre_consent_request_id\":\"$PC_ID\",\"selected_accounts\":[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"***-***-1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\"}\"}]}")
CC_ID=$(json_field "$CC" request_id)
ok "Complete-consent created  request_id=$CC_ID"

echo "  Waiting for flow to complete (5s)..."
sleep 5

# The RP keeps the consent_token server-side — this returns the resolved
# accountId(s), not the token.
DEPOSIT_ACCOUNT_ID="alpha-dep-a1b2c3d4"
CC_DATA=$(curl -sf "http://localhost:9000/complete-consent/data/$CC_ID")
CC_RESOLVED_IDS=$(echo "$CC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const ids=JSON.parse(arr[0].data||'[]');
  process.stdout.write(Array.isArray(ids) ? ids.join(',') : '');
")
[ "$CC_RESOLVED_IDS" = "$DEPOSIT_ACCOUNT_ID" ] && ok "Deposit account consented  accountId=$CC_RESOLVED_IDS" || fail "Expected accountId $DEPOSIT_ACCOUNT_ID, got: $CC_RESOLVED_IDS"

# ── Step 4a: Data request — transactions_basic (no payer/payee names) ─────────

echo ""
info "Step 4a — Data request (900.deposit_transactions_basic_001, basic, 6 months)"
# Only the accountId is sent — the RP resolves the consent_token itself.
# Level (basic) and lookback (6 months) are encoded in the service_id itself
# — no service_extension needed.
DR=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.deposit_transactions_basic_001\",\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$DEPOSIT_ACCOUNT_ID\"}")
DR_ID=$(json_field "$DR" request_id)
ok "Data request created  request_id=$DR_ID"

echo "  Waiting for flow to complete (5s)..."
sleep 5

DR_DATA=$(curl -sf "http://localhost:9000/data-request/data/$DR_ID")
TXN_COUNT=$(echo "$DR_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  process.stdout.write(String((d.transactionEntries||[]).length));
")
[ "$TXN_COUNT" -gt 0 ] 2>/dev/null && ok "Deposit transactions_basic received  ($TXN_COUNT transactions)" || fail "No transactions in deposit basic data"

BASIC_HAS_PAYER=$(echo "$DR_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  // BOT standard: transactions_basic has no debtorAccountName/creditorAccountName
  const hasPayer = (d.transactionEntries||[]).some(t => t.debtorAccountName || t.creditorAccountName);
  process.stdout.write(hasPayer ? 'yes' : 'no');
")
[ "$BASIC_HAS_PAYER" = "no" ] && ok "transactions_basic: debtorAccountName/creditorAccountName absent (correct)" || fail "transactions_basic should not contain payer/payee names"

# ── Step 4b: Data request — transactions_detail (with payer/payee names) ──────

echo ""
info "Step 4b — Data request (900.deposit_transactions_detail_001, detail, 6 months)"
DR2=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.deposit_transactions_detail_001\",\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$DEPOSIT_ACCOUNT_ID\"}")
DR2_ID=$(json_field "$DR2" request_id)
ok "Data request created  request_id=$DR2_ID"

echo "  Waiting for flow to complete (5s)..."
sleep 5

DR2_DATA=$(curl -sf "http://localhost:9000/data-request/data/$DR2_ID")
DETAIL_HAS_PAYER=$(echo "$DR2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  // BOT standard: transactions_detail has debtorAccountName or creditorAccountName
  const hasPayer = (d.transactionEntries||[]).some(t => t.debtorAccountName !== undefined || t.creditorAccountName !== undefined);
  process.stdout.write(hasPayer ? 'yes' : 'no');
")
[ "$DETAIL_HAS_PAYER" = "yes" ] && ok "transactions_detail: debtorAccountName/creditorAccountName present (correct)" || fail "transactions_detail should contain payer/payee names (BOT standard)"

echo ""
echo "  Transactions (detail):"
echo "$DR2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  (d.transactionEntries||[]).forEach(t => console.log('  ', JSON.stringify(t)));
"

# ── Step 4c: Data request — 12-month lookback (basic_002, no explicit date range) ──

echo ""
info "Step 4c — Data request (900.deposit_transactions_basic_002, basic, 12 months)"
DR3=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.deposit_transactions_basic_002\",\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$DEPOSIT_ACCOUNT_ID\"}")
DR3_ID=$(json_field "$DR3" request_id)
ok "Data request created  request_id=$DR3_ID"

echo "  Waiting for flow to complete (5s)..."
sleep 5

DR3_DATA=$(curl -sf "http://localhost:9000/data-request/data/$DR3_ID")
LOOKBACK_TXN_COUNT=$(echo "$DR3_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  process.stdout.write(String((d.transactionEntries||[]).length));
")
[ "$LOOKBACK_TXN_COUNT" = "$TXN_COUNT" ] && ok "lookback_12_months returned all $TXN_COUNT transactions (no false cap rejection)" || fail "Expected $TXN_COUNT transactions with lookback_12_months, got: $LOOKBACK_TXN_COUNT"

# ─────────────────────────────────────────────────────────────────────────────
section "CREDIT CARD FLOW (AS1 — Alpha Bank)"
# ─────────────────────────────────────────────────────────────────────────────

# ── Step 5: Pre-consent (credit card, via AS1) ────────────────────────────────

echo ""
info "Step 5 — Pre-consent (credit cards, AS1)"
PC2=$(curl -sf -X POST http://localhost:9000/pre-consent/create \
  -H "Content-Type: application/json" \
  -d '{"namespace":"citizen_id","identifier":"1234567890123","data_request_list":[{"service_id":"900.pre_consent_cardpayment_001","request_params":"{\"usage_type\":\"continuous_with_expire\",\"data_service_list\":[{\"service_id\":\"900.cardpayment_transactions_detail_001\"}]}"}]}')
PC2_ID=$(json_field "$PC2" request_id)
ok "Credit card pre-consent created  request_id=$PC2_ID"

echo "  Waiting for flow to complete (6s)..."
sleep 6

PC2_DATA=$(curl -sf "http://localhost:9000/pre-consent/data/$PC2_ID")
echo "$PC2_DATA" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d = JSON.parse(arr[0].data || '{}');
  if (d.authorization !== undefined) process.exit(1);
" && ok "Credit card pre-consent response has no as_token (RP keeps it server-side)" || fail "as_token leaked (credit card)"

echo ""
echo "  Credit card pre-consent data (masked):"
echo "$PC2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  arr.forEach(a => {
    const d=JSON.parse(a.data||'{}');
    console.log('  ['+a.service_id+'] accounts:', (d.sub_identity_list||[]).map(x=>x.visible_identifier).join(', '));
  });
"

# ── Step 6: Complete-consent (AS1, credit card) ───────────────────────────────

echo ""
info "Step 6 — Complete-consent (credit card, AS1)"
CC2=$(curl -sf -X POST http://localhost:9000/complete-consent/create \
  -H "Content-Type: application/json" \
  -d "{\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"pre_consent_request_id\":\"$PC2_ID\",\"selected_accounts\":[{\"namespace\":\"card_number\",\"identifier\":\"alpha-card-x1y2z3w4\",\"visible_identifier\":\"****-****-****-1111\",\"identifier_extension\":\"{\\\"card_type\\\":\\\"VISA\\\"}\"}]}")
CC2_ID=$(json_field "$CC2" request_id)
ok "Complete-consent created  request_id=$CC2_ID"

echo "  Waiting for flow to complete (5s)..."
sleep 5

CC_ACCOUNT_ID="alpha-card-x1y2z3w4"
CC2_DATA=$(curl -sf "http://localhost:9000/complete-consent/data/$CC2_ID")
CC2_RESOLVED_IDS=$(echo "$CC2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const ids=JSON.parse(arr[0].data||'[]');
  process.stdout.write(Array.isArray(ids) ? ids.join(',') : '');
")
[ "$CC2_RESOLVED_IDS" = "$CC_ACCOUNT_ID" ] && ok "Credit card account consented  accountId=$CC2_RESOLVED_IDS" || fail "Expected accountId $CC_ACCOUNT_ID, got: $CC2_RESOLVED_IDS"

# ── Step 7: Data request — credit card transactions_detail ────────────────────

echo ""
info "Step 7 — Data request (900.cardpayment_transactions_detail_001, AS1, detail, 6 months)"
DR_CC=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.cardpayment_transactions_detail_001\",\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$CC_ACCOUNT_ID\"}")
DR_CC_ID=$(json_field "$DR_CC" request_id)
ok "Credit card data request created  request_id=$DR_CC_ID"

echo "  Waiting for flow to complete (5s)..."
sleep 5

DR_CC_DATA=$(curl -sf "http://localhost:9000/data-request/data/$DR_CC_ID")
CC_TXN_COUNT=$(echo "$DR_CC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  process.stdout.write(String((d.transactionEntries||[]).length));
")
[ "$CC_TXN_COUNT" -gt 0 ] 2>/dev/null && ok "Credit card transactions_detail received  ($CC_TXN_COUNT transactions)" || fail "No transactions in credit card data"

CC_HAS_DESCRIPTION=$(echo "$DR_CC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  const has = (d.transactionEntries||[]).some(t => t.transactionDescription !== undefined);
  process.stdout.write(has ? 'yes' : 'no');
")
[ "$CC_HAS_DESCRIPTION" = "yes" ] && ok "transactions_detail: transactionDescription present (correct)" || fail "transactions_detail should contain transactionDescription"

echo ""
echo "  Transactions (detail):"
echo "$DR_CC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  (d.transactionEntries||[]).forEach(t => console.log('  ', JSON.stringify(t)));
"

# ─────────────────────────────────────────────────────────────────────────────
section "MULTI-AS PRE-CONSENT (AS1 + AS2 for deposit, AS1 for credit card)"
# ─────────────────────────────────────────────────────────────────────────────
#
# Demonstrates the scenario where:
#   - Two banks (AS1=Alpha Bank, AS2=Beta Bank) both serve deposit pre-consent
#   - Only AS1 (Alpha Bank) serves credit card pre-consent
#   - A single NDID request covers both service types with min_as enforced
#   - Result: 3 as_tokens (AS1 deposit, AS2 deposit, AS1 credit card) — all
#     kept server-side by the RP. Notably AS1 issues two different tokens
#     for the same request_id, which exercises the RP's disambiguation by
#     accountId overlap (see asTokenStore in rp/example1/src/server.ts).
#

echo ""
info "Step M1 — Multi-AS pre-consent (deposit x2 + credit card x1)"
# request_params is a JSON-stringified string per NDID spec.
# AS stores usage_type + data_service_list at pre-consent time, reads at complete-consent.
PMC=$(curl -sf -X POST http://localhost:9000/pre-consent/create \
  -H "Content-Type: application/json" \
  -d '{"namespace":"citizen_id","identifier":"1234567890123","data_request_list":[{"service_id":"900.pre_consent_deposit_001","as_id_list":["as1","as2"],"min_as":2,"request_params":"{\"usage_type\":\"continuous_with_expire\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_basic_001\"},{\"service_id\":\"900.deposit_transactions_detail_001\"}]}"},{"service_id":"900.pre_consent_cardpayment_001","as_id_list":["as1"],"min_as":1,"request_params":"{\"usage_type\":\"continuous_with_expire\",\"data_service_list\":[{\"service_id\":\"900.cardpayment_transactions_detail_001\"}]}"}]}')
PMC_ID=$(json_field "$PMC" request_id)
ok "Multi-AS pre-consent created  request_id=$PMC_ID"

echo "  Waiting for all 3 AS responses (8s)..."
sleep 8

PMC_DATA=$(curl -sf "http://localhost:9000/pre-consent/data/$PMC_ID")

ENTRY_COUNT=$(echo "$PMC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(String(arr.length));
")
[ "$ENTRY_COUNT" -eq 3 ] 2>/dev/null \
  && ok "3 data entries returned (AS1 deposit + AS2 deposit + AS1 credit card)" \
  || fail "Expected 3 entries, got $ENTRY_COUNT"

echo ""
echo "  Multi-AS pre-consent entries:"
echo "$PMC_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  arr.forEach((a,i) => {
    const d=JSON.parse(a.data||'{}');
    if (d.authorization !== undefined) { console.error('authorization leaked to client!'); process.exit(1); }
    const accounts=(d.sub_identity_list||[]).map(x=>x.visible_identifier).join(', ');
    console.log('  ['+i+'] source='+a.source_node_id+' service='+a.service_id+' accounts='+accounts);
  });
" && ok "Multi-AS pre-consent responses have no as_token (RP keeps all 3 server-side)" || fail "as_token leaked in multi-AS pre-consent"

# ── Step M2: Complete-consent for AS2 deposit (Beta Bank) ────────────────────
# $PMC_ID plus each account's identifier is enough for the RP to resolve the
# right token, even though AS1 issued two different tokens for this same
# request_id (deposit + credit card).

echo ""
info "Step M2 — Complete-consent for AS2 deposit (Beta Bank)"
CC_AS2=$(curl -sf -X POST http://localhost:9000/complete-consent/create \
  -H "Content-Type: application/json" \
  -d "{\"as_node_id\":\"as2\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"pre_consent_request_id\":\"$PMC_ID\",\"selected_accounts\":[{\"namespace\":\"account_id\",\"identifier\":\"beta-dep-c1d2e3f4\",\"visible_identifier\":\"***-***-9001\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\"}\"}]}")
CC_AS2_ID=$(json_field "$CC_AS2" request_id)
ok "AS2 complete-consent created  request_id=$CC_AS2_ID"

echo "  Waiting (5s)..."
sleep 5

AS2_ACCOUNT_ID="beta-dep-c1d2e3f4"
CC_AS2_DATA=$(curl -sf "http://localhost:9000/complete-consent/data/$CC_AS2_ID")
CC_AS2_RESOLVED_IDS=$(echo "$CC_AS2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const ids=JSON.parse(arr[0].data||'[]');
  process.stdout.write(Array.isArray(ids) ? ids.join(',') : '');
")
[ "$CC_AS2_RESOLVED_IDS" = "$AS2_ACCOUNT_ID" ] && ok "AS2 (Beta Bank) account consented  accountId=$CC_AS2_RESOLVED_IDS" || fail "Expected accountId $AS2_ACCOUNT_ID, got: $CC_AS2_RESOLVED_IDS"

echo ""
info "Step M3 — Data request: 900.deposit_transactions_detail_001 from AS2 (Beta Bank)"
DR_AS2=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.deposit_transactions_detail_001\",\"as_node_id\":\"as2\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$AS2_ACCOUNT_ID\"}")
DR_AS2_ID=$(json_field "$DR_AS2" request_id)
ok "AS2 data request created  request_id=$DR_AS2_ID"

echo "  Waiting (5s)..."
sleep 5

DR_AS2_DATA=$(curl -sf "http://localhost:9000/data-request/data/$DR_AS2_ID")
AS2_TXN_COUNT=$(echo "$DR_AS2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  process.stdout.write(String((d.transactionEntries||[]).length));
")
[ "$AS2_TXN_COUNT" -gt 0 ] 2>/dev/null \
  && ok "Beta Bank deposit transactions received  ($AS2_TXN_COUNT transactions)" \
  || fail "No transactions from AS2 (Beta Bank)"

echo ""
echo "  Beta Bank transactions (detail):"
echo "$DR_AS2_DATA" | node -e "
  const arr=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const d=JSON.parse(arr[0].data||'{}');
  (d.transactionEntries||[]).forEach(t => console.log('  ', JSON.stringify(t)));
"

# ─────────────────────────────────────────────────────────────────────────────
section "REVOKE"
# ─────────────────────────────────────────────────────────────────────────────

# ── Step 8: Revoke deposit consent ───────────────────────────────────────────

echo ""
info "Step 8 — Revoke deposit consent"
# The caller sends account_ids — the RP resolves the matching consent_token(s).
RV=$(curl -sf -X POST http://localhost:9000/revoke/create \
  -H "Content-Type: application/json" \
  -d "{\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_ids\":[\"$DEPOSIT_ACCOUNT_ID\"]}")
RV_ID=$(json_field "$RV" request_id)
ok "Deposit revoke initiated  request_id=$RV_ID"

echo "  Waiting for revoke to complete (5s)..."
sleep 5

echo ""
info "Step 8b — Verify revoked deposit token is rejected (expect error 40720)"
# Same account_id as before — the RP resolves the same (now-revoked) token,
# and the AS rejects it.
RV_DR=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.deposit_transactions_basic_001\",\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$DEPOSIT_ACCOUNT_ID\"}")
RV_DR_ID=$(json_field "$RV_DR" request_id)

echo "  Waiting for AS to reject revoked token (4s)..."
sleep 4

RV_DR_DATA=$(curl -sf "http://localhost:9000/data-request/data/$RV_DR_ID")
RV_IS_ERROR=$(echo "$RV_DR_DATA" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  process.stdout.write(arr[0]?.error ? 'yes' : 'no');
")
RV_ERROR_CODE=$(echo "$RV_DR_DATA" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  process.stdout.write(String(arr[0]?.error_code || ''));
")
[ "$RV_IS_ERROR" = "yes" ] && ok "Revoked deposit token correctly rejected" || fail "Expected error for revoked deposit token"
[ "$RV_ERROR_CODE" = "40720" ] && ok "Error code 40720 confirmed (Token has been revoked)" || fail "Expected 40720, got: $RV_ERROR_CODE"

# ── Step 9: Revoke credit card consent ───────────────────────────────────────

echo ""
info "Step 9 — Revoke credit card consent"
RV2=$(curl -sf -X POST http://localhost:9000/revoke/create \
  -H "Content-Type: application/json" \
  -d "{\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_ids\":[\"$CC_ACCOUNT_ID\"]}")
RV2_ID=$(json_field "$RV2" request_id)
ok "Credit card revoke initiated  request_id=$RV2_ID"

echo "  Waiting for revoke to complete (5s)..."
sleep 5

echo ""
info "Step 9b — Verify revoked credit card token is rejected (expect error 40720)"
RV2_DR=$(curl -sf -X POST http://localhost:9000/data-request/create \
  -H "Content-Type: application/json" \
  -d "{\"service_id\":\"900.cardpayment_transactions_detail_001\",\"as_node_id\":\"as1\",\"namespace\":\"citizen_id\",\"identifier\":\"1234567890123\",\"account_id\":\"$CC_ACCOUNT_ID\"}")
RV2_DR_ID=$(json_field "$RV2_DR" request_id)

echo "  Waiting for AS to reject revoked token (4s)..."
sleep 4

RV2_DR_DATA=$(curl -sf "http://localhost:9000/data-request/data/$RV2_DR_ID")
RV2_IS_ERROR=$(echo "$RV2_DR_DATA" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  process.stdout.write(arr[0]?.error ? 'yes' : 'no');
")
RV2_ERROR_CODE=$(echo "$RV2_DR_DATA" | node -e "
  const arr = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  process.stdout.write(String(arr[0]?.error_code || ''));
")
[ "$RV2_IS_ERROR" = "yes" ] && ok "Revoked credit card token correctly rejected" || fail "Expected error for revoked credit card token"
[ "$RV2_ERROR_CODE" = "40720" ] && ok "Error code 40720 confirmed (Token has been revoked)" || fail "Expected 40720, got: $RV2_ERROR_CODE"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All flows completed successfully                         ${NC}"
echo -e "${GREEN}  AS1 Alpha Bank (deposit+cc): steps 1–7 + revoke verified ${NC}"
echo -e "${GREEN}  AS2 Beta Bank (deposit only): steps M1–M3                ${NC}"
echo -e "${GREEN}  Multi-AS pre-consent:         steps M1–M3 (3 as_tokens, all kept server-side) ${NC}"
echo -e "${GREEN}  Revocation:                   steps 8–9b (40720 verified) ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Logs:"
echo "  IDP  /tmp/ydtest-idp.log"
echo "  RP   /tmp/ydtest-rp.log"
echo "  AS1  /tmp/ydtest-as1.log"
echo "  AS2  /tmp/ydtest-as2.log"
