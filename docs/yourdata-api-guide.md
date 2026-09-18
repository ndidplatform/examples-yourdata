# YourData API — Developer Guide

NDID Platform · Centralized Data Exchange Mechanism · v1.4.1  
Audience: **DC / RP (Data Consumer)** developers

---

## Table of Contents

1. [Party Roles](#1-party-roles)
2. [Full Flow Overview](#2-full-flow-overview)
3. [Service IDs](#3-service-ids)
4. [Dataset APIs & Permissions](#4-dataset-apis--permissions)
5. [Error Codes](#5-error-codes)
6. [Token Types](#6-token-types)
7. [Step 1 — Register Identity (IDP)](#7-step-1--register-identity-idp)
8. [Step 2 — Pre-Consent (On-chain)](#8-step-2--pre-consent-on-chain)
9. [Step 3 — Complete-Consent](#9-step-3--complete-consent)
10. [Step 4 — Request Data](#10-step-4--request-data)
11. [Step 5 — Revoke Consent (On-chain)](#11-step-5--revoke-consent-on-chain)
12. [Mock Data Reference](#12-mock-data-reference)

---

## 1. Party Roles

| Party | Abbreviation | Role |
|-------|-------------|------|
| Data Consumer | **RP / DC** | Your application. Initiates requests, stores tokens server-side, never exposes raw tokens to the client. |
| Identity Provider | **IDP** | User's bank for authentication. Receives push notifications, presents consent screen, signs accessor challenges. |
| Asset Server / Data Provider | **AS / DP** | Bank holding the user's financial data. Issues masked account lists, creates as_tokens and consent_tokens. |
| NDID Platform | **NDID** | On-chain consent routing layer. Verifies signatures, routes callbacks, encrypts data payloads. |

---

## 2. Full Flow Overview

```
Step 1  Register Identity   (IDP)      — one-time setup, citizen_id on-chain
Step 2  Pre-Consent         (on-chain) — RP -> NDID -> IDP (user auth) -> AS per (dataset x AS)
Step 3  Complete-Consent    (off-chain)— RP -> NDID -> AS  per pre-consent token
Step 4  Request Data        (off-chain)— RP -> NDID -> AS  per consent_token
Step 5  Revoke Consent      (on-chain) — RP -> NDID -> IDP (user auth) -> AS
```

### Request Status Transitions (Steps 3 & 4)

```
pending
  -> data_decryption_pending
  -> data_decryption_key_requested
  -> data_decryption_key_available
  -> completed
  OR errored  (AS returned error code)
```

If stuck at `data_decryption_key_requested`, retry via:
```
POST /v7/yourdata/rp/data_decryption_key_retry_requests
```

### Key Design Principles

- **Tokens are never exposed to the client.** The RP keeps all `as_token` and `consent_token` values server-side, keyed by `(pre_consent_request_id, as_node_id)` and `(account_id, service_id)` respectively.
- **One pre-consent token per (dataset × AS).** Each AS registered for a dataset receives its own callback and issues its own `as_token`.
- **One complete-consent call per pre-consent token.** The number of complete-consent calls = number of (dataset × AS) combinations, not number of unique AS nodes.
- **Unmasking is dataset-specific, and applies to `identifier` AND `visible_identifier` together.** At pre-consent, both `identifier` (an AS-generated opaque ID) and `visible_identifier` (a masked display string) are masked/opaque in `sub_identity_list`. Whether they become the real, unmasked account value at complete-consent depends on the dataset (see NDID's "Response Schema for pre_consent" reference):
  - **Deposit / Loan** — both `identifier` **and** `visible_identifier` change to the same real `account_id` at complete-consent (§9.3) — there's nothing left to mask once the AS is creating a token for a specific, already-confirmed account.
  - **Card Payment** — neither field changes; `identifier` stays the same opaque value and `visible_identifier` stays the same masked BIN, even in the `consent_token` (PCI-DSS).
  - **e-Money** — `identifier` is already the AS's internal customer/wallet ID from pre-consent onward, and `visible_identifier` stays masked; there's no separate "unmasked" value to switch to for either.
  - **Namespace per dataset:** `account_id` (Deposit, Loan), `card_number` (Card Payment), `e_wallet_id` (e-Money) — not `account_id` for e-Money.
- **`request_timeout` is per-call, not cumulative.** Every step that carries a `request_timeout` (pre-consent, complete-consent, request-data) times out **independently** — it is not a shared budget across the end-to-end flow. A slow complete-consent call does not eat into the request-data step's timeout, and vice versa. Set each `request_timeout` based on how long that specific step realistically needs.

---

## 3. Service IDs

### On-chain Services (Standard NDID API)

Used with `POST /v7/rp/requests/:namespace/:identifier`

| Service ID | Description |
|-----------|-------------|
| `900.pre_consent_deposit_001` | Pre-consent — Deposit |
| `900.pre_consent_emoney_001` | Pre-consent — e-Money |
| `900.pre_consent_cardpayment_001` | Pre-consent — Card Payment |
| `900.pre_consent_loan_001` | Pre-consent — Loan |
| `900.revoke_consent_001` | Revoke consent |

### AS Service Registration — On-chain (One-time Setup)

Before any of the 5 on-chain service_ids above will route to your AS node, **register each one** via a different endpoint than the YourData one below:

```
POST /v7/as/service/{service_id}
```
```json
{
  "reference_id": "as-svc-reg-1750000000000",
  "callback_url": "http://as-cb:6002/as/service/callback",
  "min_ial": 2.3,
  "min_aal": 2.1,
  "url": "https://as1.example.com/as/service_data",
  "supported_namespace_list": ["citizen_id"]
}
```

> `reference_id` and `callback_url` are **always required**. `min_ial`/`min_aal`/`url`/`supported_namespace_list` are only optional when **updating** a `service_id` your node has already registered — on the **first** registration of a given `service_id`, all four are required too (the handler throws `MISSING_ARGUMENTS` otherwise). There's no `supported_authorization`/`service_availability` here — the on-chain flow doesn't have YourData's token/usage_type concept. Register each of the 5 service_ids above (`900.pre_consent_*`, `900.revoke_consent_001`) this way.

### Off-chain YourData Services (YourData API)

Used with `POST /v7/yourdata/rp/requests`

| Service ID | Description |
|-----------|-------------|
| `900.complete_consent_001` | Complete consent (token exchange) |
| `900.deposit_account_001` | Deposit — account info |
| `900.deposit_balance_001` | Deposit — balance |
| `900.deposit_transactions_basic_001` | Deposit — transactions (Basic, 6mo) |
| `900.deposit_transactions_basic_002` | Deposit — transactions (Basic, 12mo) |
| `900.deposit_transactions_detail_001` | Deposit — transactions (Detail, 6mo) |
| `900.deposit_transactions_detail_002` | Deposit — transactions (Detail, 12mo) |
| `900.deposit_statement_basic_001` | Deposit — statement (Basic, 6mo) |
| `900.deposit_statement_basic_002` | Deposit — statement (Basic, 12mo) |
| `900.deposit_statement_detail_001` | Deposit — statement (Detail, 6mo) |
| `900.deposit_statement_detail_002` | Deposit — statement (Detail, 12mo) |
| `900.emoney_account_001` | e-Money — account info |
| `900.emoney_balance_001` | e-Money — balance |
| `900.emoney_transactions_basic_001` | e-Money — transactions (Basic, 6mo) |
| `900.emoney_transactions_basic_002` | e-Money — transactions (Basic, 12mo) |
| `900.emoney_transactions_detail_001` | e-Money — transactions (Detail, 6mo) |
| `900.emoney_transactions_detail_002` | e-Money — transactions (Detail, 12mo) |
| `900.emoney_statement_basic_001` | e-Money — statement (Basic, 6mo) |
| `900.emoney_statement_basic_002` | e-Money — statement (Basic, 12mo) |
| `900.emoney_statement_detail_001` | e-Money — statement (Detail, 6mo) |
| `900.emoney_statement_detail_002` | e-Money — statement (Detail, 12mo) |
| `900.cardpayment_account_001` | Card Payment — account info |
| `900.cardpayment_outstandingbalance_001` | Card Payment — outstanding balance |
| `900.cardpayment_transactions_basic_001` | Card Payment — transactions (Basic, 6mo) |
| `900.cardpayment_transactions_basic_002` | Card Payment — transactions (Basic, 12mo) |
| `900.cardpayment_transactions_detail_001` | Card Payment — transactions (Detail, 6mo) |
| `900.cardpayment_transactions_detail_002` | Card Payment — transactions (Detail, 12mo) |
| `900.cardpayment_scheduledpayment_001` | Card Payment — scheduled payment |
| `900.cardpayment_statement_001` | Card Payment — statement |
| `900.loan_account_001` | Loan — account info |
| `900.loan_outstandingbalance_001` | Loan — outstanding balance |
| `900.loan_statement_001` | Loan — statement |

### AS Service Registration — Off-chain (One-time Setup)

Before any of the above works, **each AS must register every service_id it supports**:

```
POST /v7/yourdata/as/service/{service_id}
```
```json
{
  "service_url": "https://as1.example.com/yourdata/callback",
  "supported_namespace_list": ["citizen_id"],
  "supported_authorization": ["token_one_time", "token_continuous_with_expire"],
  "service_availability": true
}
```

> `supported_namespace_list` is checked against the **top-level citizen namespace** of the incoming request (always `citizen_id` for YourData) — not the sub-account namespace inside `sub_identity_list` (e.g. `account_id`, `card_number`, `e_wallet_id`, per §3). Register `["citizen_id"]` here.
>
> `supported_authorization` declares which token `usage_type`s this service_id accepts — the AS node validates incoming tokens against whatever was registered here. For YourData today, register whichever of **`token_one_time`** and **`token_continuous_with_expire`** your bank actually supports for that service.
>
> **Register `900.complete_consent_001` with at least `token_one_time`** — even if your bank only supports `continuous_with_expire` consent overall. Complete-consent and request-data share the same underlying validation mechanism, and the pre-consent → complete-consent exchange always uses a `one_time` as_token (§6) regardless of what usage_type the eventual consent_token will have. Forgetting this means valid complete-consent calls get rejected.
>
> \* The full enum also includes `no_token_needed` and `token_continuous_no_expire` — the latter is reserved for future use (project CONNEXT) and has no YourData use case today.
> Register each dataset service_id (`900.deposit_transactions_basic_001`, etc.) with whichever usage_types your bank actually supports for that data.

---

## 4. Dataset APIs & Permissions

Each `service_id` is selected as its own checkbox/flag — **`service_id` selection is a separate concern from `service_extension`, never conflated into one control** (per regulator review feedback, 2026-07-21). This is verified against the real `YourData_Schema_*` OpenAPI specs (SwaggerHub, `NDID/YourData_Schema_{Deposit,EMoney,CardPayment,Loan}` v1.0.1, updated 27 Aug 2026).

> **`service_extension` is no longer how Basic/Detail (or lookback period) is selected.** As of the v1.0.1 schemas, Transactions and Statement are no longer one `service_id` gated by a `service_extension` flag — each combination of tier (Basic/Detail) × lookback period (6 or 12 months) is its own distinct `service_id`, e.g. `900.deposit_transactions_basic_001` (Basic, 6mo) / `_002` (Basic, 12mo) / `900.deposit_transactions_detail_001` (Detail, 6mo) / `_002` (Detail, 12mo), and the same `_basic_001/_002` / `_detail_001/_002` pattern for Statement. This applies to Deposit, Card Payment, and e-Money's Transactions, and to Deposit/e-Money's Statement (Card Payment/Loan Statement and every dataset's Account/Balance/Outstanding Balance/Scheduled Payment still have exactly **one** response shape — no split, no `service_extension`, `service_id` selection alone is enough). `service_extension` itself is no longer used anywhere in Step 2/4's dataset request_params — RP-side permission selection is purely by `service_id` now.

Request query params also differ per dataset — see each dataset's endpoint request body/query shape below (not a single universal `fromXDate`/`toXDate` pair). Note these are request **body** fields on the underlying `POST`, not URL query-string parameters, despite "Request query" being this guide's shorthand for them.

### Deposit

Request query: `language` (all); `fromBookingDateTime`/`toBookingDateTime` (Transactions, Statement — date-time, fixed `00:00:00+07:00`/`23:59:59+07:00`).

| API Endpoint | Service ID | Tier | Lookback |
|---|---|---|---|
| Account | `900.deposit_account_001` | *(single response shape — no Basic/Detail split)* | – |
| Balance | `900.deposit_balance_001` | *(single response shape — no Basic/Detail split)* | – |
| Transactions | `900.deposit_transactions_basic_001` | Basic | 6 months |
| | `900.deposit_transactions_basic_002` | Basic | 12 months |
| | `900.deposit_transactions_detail_001` | Detail | 6 months |
| | `900.deposit_transactions_detail_002` | Detail | 12 months |
| Statement | `900.deposit_statement_basic_001` | Basic | 6 months |
| | `900.deposit_statement_basic_002` | Basic | 12 months |
| | `900.deposit_statement_detail_001` | Detail | 6 months |
| | `900.deposit_statement_detail_002` | Detail | 12 months |

### Card Payment

Request query: `language` (all); `fromTransactionDate`/`toTransactionDate` (Transactions — date, not date-time); `statementDate` (Scheduled Payment, Statement — single date, not a range). Outstanding Balance takes no date parameter — same request shape as Account (`language` + optional `auxiliaryReferenceId` only).

| API Endpoint | Service ID | Permission | `service_extension` value |
|---|---|---|---|
| Account | `900.cardpayment_account_001` | *(service_id checkbox only)* | *(none — single response shape, no Basic/Detail split)* |
| Outstanding Balance | `900.cardpayment_outstandingbalance_001` | *(service_id checkbox only)* | *(none — single response shape, no Basic/Detail split)* |
| Transactions | `900.cardpayment_transactions_basic_001` | Transactions Basic, 6mo lookback | *(none — service_id itself selects tier + lookback)* |
| | `900.cardpayment_transactions_basic_002` | Transactions Basic, 12mo lookback | *(none)* |
| | `900.cardpayment_transactions_detail_001` | Transactions Detail, 6mo lookback | *(none)* |
| | `900.cardpayment_transactions_detail_002` | Transactions Detail, 12mo lookback | *(none)* |
| Scheduled Payment | `900.cardpayment_scheduledpayment_001` | *(service_id checkbox only)* | *(none)* |
| Statement | `900.cardpayment_statement_001` | *(service_id checkbox only)* | *(none — single response shape, no Basic/Detail split)* |

### Loan

Request query: `language` (Account, Outstanding Balance); `billDate` + `language` (Statement — single month, `YYYY-MM`, not a range). **No Transactions endpoint exists for Loan.**

| API Endpoint | Service ID | Permission | `service_extension` value |
|---|---|---|---|
| Account | `900.loan_account_001` | *(service_id checkbox only)* | *(none — single response shape, no Basic/Detail split)* |
| Outstanding Balance | `900.loan_outstandingbalance_001` | *(service_id checkbox only)* | *(none — single response shape, no Basic/Detail split)* |
| Statement | `900.loan_statement_001` | *(service_id checkbox only)* | *(none — single response shape, no Basic/Detail split)* |

### e-Money

Request query: `language` (all); `fromBookingDateTime`/`toBookingDateTime` (Transactions, Statement).

| API Endpoint | Service ID | Tier | Lookback |
|---|---|---|---|
| Account | `900.emoney_account_001` | *(single response shape — no Basic/Detail split)* | – |
| Balance | `900.emoney_balance_001` | *(single response shape — no Basic/Detail split)* | – |
| Transactions | `900.emoney_transactions_basic_001` | Basic | 6 months |
| | `900.emoney_transactions_basic_002` | Basic | 12 months |
| | `900.emoney_transactions_detail_001` | Detail | 6 months |
| | `900.emoney_transactions_detail_002` | Detail | 12 months |
| Statement | `900.emoney_statement_basic_001` | Basic | 6 months |
| | `900.emoney_statement_basic_002` | Basic | 12 months |
| | `900.emoney_statement_detail_001` | Detail | 6 months |
| | `900.emoney_statement_detail_002` | Detail | 12 months |

---

## 5. Error Codes

All codes are type `as`. Registered in the YourData domain via `GetDomainErrorCodeList`.

| Code | Description | Source |
|------|-------------|--------|
| `40000` | Unknown Error | AS application |
| `40100` | No Data | AS application |
| `40400` | Invalid data / params (e.g. empty account selection, more than 5 accounts selected per dataset at complete-consent, bad date range) | AS application |
| `40710` | Date Range Exceeds Permission | AS application |
| `40720` | Consent Token Revoked | AS application |
| `40730` | One-Time Token Already Used | AS application |
| `40780` | AS Data Size Larger Than Limit — response data exceeds the platform's size limit; AS must check response size before sending and return this instead of an oversized payload | AS application |
| `40740` | unsupported\_service (auto-error, no callback) | AS node |
| `40750` | service\_not\_available (auto-error, no callback) | AS node |
| `40760` | unsupported\_namespace (auto-error, no callback) | AS node |
| `40770` | unsupported\_authorization (auto-error, no callback) | AS node |

---

## 6. Token Types

### `usage_type` values

| `usage_type` | Description | Consent Type |
|---|---|---|
| `one_time` | Token can be used **exactly once**. AS marks it used after data is sent. Error `40730` on reuse. | One-time Consent |
| `continuous_with_expire` | Valid until `expiration_datetime` (≤ 1 year). Revocable. | Recurring — with expiry |
| `continuous_no_expire` | Valid until explicitly revoked. Error `40720` after revoke. | Recurring — no expiry |

> `expiration_datetime` is a **Unix timestamp in seconds** (same convention as `request_timeout`), not milliseconds.  
> It is **required for `one_time` and `continuous_with_expire`** (creation fails with `TOKEN_MUST_HAVE_EXPIRATION_TIME` otherwise) and **must be omitted for `continuous_no_expire`** (fails with `TOKEN_MUST_NOT_HAVE_EXPIRATION_TIME` if present).

### Token creation rules — Complete-Consent

| `usage_type` | Tokens per pre-consent token call | `service_id_list` per token |
|---|---|---|
| `one_time` | **1 token per (account × service_id)** | 1 entry |
| `continuous_with_expire` | **1 token per account** | All selected services |
| `continuous_no_expire` | **1 token per account** | All selected services |

**Example** — 2 accounts, 3 selected services, `one_time`:
- 2 × 3 = **6 tokens** issued by AS in one complete-consent call

### Token Creation — Field-by-Field Guideline

`POST /v7/yourdata/utility/token` creates both the pre-consent **`as_token`** (§8.5) and the complete-consent **`consent_token`** (§9.3) — same endpoint, different field values. `token_id`, `as_node_signing_key_version`, and `issue_datetime` are always server-generated and must not be sent.

| Field | `as_token` (Pre-Consent) | `consent_token` (Complete-Consent) |
|---|---|---|
| `requester_node_id` | RP's node ID | Same |
| `as_node_id` | This AS's own node ID | Same |
| `namespace` / `identifier` | `citizen_id` / citizen ID | Same |
| `token_objective` | *(omitted — carried instead inside the embedded intent, see below)* | The RP-supplied objective string (§8.1), reconstructed from the as_token's embedded intent |
| `sub_identity_list` | *(omitted — not scoped to a specific account yet)* | **Required.** The real account this token grants access to — 1 token = 1 account |
| `service_id_list` | Always exactly 1 entry: `{service_id: "900.complete_consent_001", service_extension: [<embedded intent JSON>]}` | The actual dataset `service_id`(s) requested, each with `service_extension: []` — 1 entry for `one_time`, all selected services for `continuous_*` |
| `validate_identifier` / `validate_service_id` | `true` / `true` | `true` / `true` |
| `validate_service_extension` | `false` (the real intent is embedded, not matched literally) | `true` — paired with an explicit `service_extension: []` on the token (see note below) |
| `usage_type` | Always `"one_time"` — the as_token itself is a short-lived exchange token, regardless of what usage_type the RP ultimately wants for the consent_token | The RP-declared usage_type (`one_time` / `continuous_with_expire` / `continuous_no_expire`), reconstructed from the embedded intent |
| `expiration_datetime` | Short-lived (e.g. ~15 min) — required since usage_type is `one_time` | Per the usage_type rule above (required except `continuous_no_expire`) |
| **`source_request_id_list`** | `["req-pre-xxxx"]` — just the pre-consent request_id | `["req-pre-xxxx", "req-cc-{dataset}-{as}"]` — **both** the original pre-consent request_id **and** this complete-consent request_id, forming a full audit trail from initial consent through to token issuance |
| **Tokens created per call** | Always **1** — one as_token per pre-consent callback (i.e. per dataset × AS), regardless of usage_type | Per the table above — 1 per (account × service_id) for `one_time`, 1 per account for `continuous_*` |

> **What `validate_identifier` / `validate_service_id` / `validate_service_extension` actually do:** these flags travel inside the signed token and are enforced **automatically by NDID's platform software on the AS's node**, before your application's callback is ever invoked (see §10.2's "what the platform already validated").
> - `validate_identifier: true` → platform confirms the `namespace`/`identifier` (or `sub_identity_list` account) on the incoming request matches the token's.
> - `validate_service_id: true` → platform confirms the requested `service_id` matches one the token was scoped to.
> - `validate_service_extension: true` → platform confirms the request's `service_extension` array is a subset of the token's. `as_token` keeps this `false` (its `service_extension` carries the intent JSON, not meant to be literally compared). `consent_token` sets it `true`, paired with an explicit `service_extension: []` on every `service_id_list` entry at token creation (§9.3). The example in §10.1/§10.2 shows the RP sending `service_extension: []` explicitly on the matching Step 4 request, echoed back in §10.2's callback — that's the convention shown here.
>
> Setting a flag `false` tells the platform it does **not** need to enforce that particular match. A mismatch on any `true` flag rejects the request before your callback URL is even called.

---

## 7. Step 1 — Register Identity (IDP)

**One-time setup.** IDP generates an RSA accessor key-pair and commits the public key on-chain.

### 7.1 IDP: Create Identity

```
POST /v7/identity
```

**Request body:**
```json
{
  "reference_id": "register-identity-xxx",
  "callback_url": "http://idp-cb:6000/idp/identity",
  "identity_list": [
    { "namespace": "citizen_id", "identifier": "1234567890123" }
  ],
  "mode": 2,
  "accessor_type": "RSA",
  "accessor_public_key": "<RSA PEM public key>",
  "accessor_id": "acc-xxxx",
  "ial": 2.3
}
```

> `identity_list` (min 1 item) lets one call link multiple `(namespace, identifier)` pairs to the same identity. `mode` only accepts `2` or `3` for this endpoint. `accessor_id` is optional — omit it to let the system auto-generate one.

**NDID sync response** (`202`):
```json
{ "request_id": "req-identity-xxxx", "exist": false, "accessor_id": "acc-xxxx" }
```

> `request_id` is only present when a consent request is needed (the identity already exists on the platform under a different IdP). `exist` reflects whether the `(namespace, identifier)` was already onboarded elsewhere.

**NDID result callback** → `POST /idp/identity`:
```json
{
  "node_id": "idp1",
  "type": "create_identity_result",
  "success": true,
  "reference_id": "register-identity-xxx",
  "request_id": "req-identity-xxxx",
  "reference_group_code": "rg-xxxx"
}
```

> Shown above is the common case — a brand-new identity with no cross-IdP consent needed (`min_idp = 0`). If the identity already exists elsewhere and cross-IdP consent **is** required, NDID first fires an intermediate `POST /idp/identity` callback with `type: "create_identity_request_result"` (fields: `node_id`, `type`, `reference_id`, `request_id`, `accessor_id`, `creation_block_height`, `success`, `exist` — no `reference_group_code` yet) before the final `create_identity_result` above arrives once the existing IdP(s) respond.

### 7.2 RP: Get IDP List (for IDP picker UI)

```
GET /v7/utility/idp/citizen_id/{identifier}?min_ial=2.3&min_aal=2.1&mode=2
```

**Response:**
```json
[
  { "node_id": "idp1", "node_name": "Alpha Bank IDP", "ial": 2.3, "mode_list": [2, 3], "max_ial": 2.3, "max_aal": 3 },
  { "node_id": "idp2", "node_name": "Beta Bank IDP",  "ial": 2.3, "mode_list": [2],    "max_ial": 2.3, "max_aal": 3 }
]
```

> `mode` here is `2`, not `3` — the YourData use case only uses mode 2 throughout (see §8.1's note). `mode_list` shows which mode(s) each IdP supports for this identity; either IdP works for a mode-2 request.

Pass the user's chosen `node_id` as `idp_id_list` in Step 2.

---

## 8. Step 2 — Pre-Consent (On-chain)

**Parties:** RP → NDID → IDP (user authentication) → AS (one callback per dataset × AS)

One NDID request is created. After the IDP authenticates the user, NDID sends a separate `data_request` callback to **every (dataset × AS)** combination in `data_request_list`. Each AS issues one `as_token` and returns a masked account list for its dataset.

### 8.1 RP: Create On-chain Consent Request

```
POST /v7/rp/requests/citizen_id/{identifier}
```

**Request body:**
```json
{
  "mode": 2,
  "reference_id": "pre-consent-1750000000000",
  "idp_id_list": ["idp1"],
  "callback_url": "http://rp-cb:6001/rp/request/pre-consent-xxx",
  "bypass_identity_check": false,
  "data_request_list": [
    {
      "service_id": "900.pre_consent_deposit_001",
      "as_id_list": ["as1", "as2"],
      "min_as": 0,
      "request_params": "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_basic_001\",\"service_version\":\"v1\"}],\"language\":\"EN\",\"accountSubType\":\"ALL\",\"auxiliaryReferenceId\":\"aux-pre-consent-1750000000000\"}"
    },
    {
      "service_id": "900.pre_consent_cardpayment_001",
      "as_id_list": ["as1"],
      "min_as": 0,
      "request_params": "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.cardpayment_transactions_basic_001\",\"service_version\":\"v1\"}],\"language\":\"EN\",\"auxiliaryReferenceId\":\"aux-pre-consent-1750000000000\"}"
    }
  ],
  "request_message": "Please consent to share your data (REF: pre-consent-xxx)",
  "min_ial": 2.3,
  "min_aal": 2.1,
  "min_idp": 1,
  "request_timeout": 600,
  "request_type": "AuthenOnly"
}
```

> `namespace`/`identifier` are **URL path params** (`/v7/rp/requests/citizen_id/{identifier}`), not body fields. `bypass_identity_check` is required when `mode` is `2` or `3` — `false` means the platform verifies each IdP in `idp_id_list` actually has this identity onboarded at the required IAL before routing to it.  
> **This use case only uses `mode: 2`** — carried through unchanged from identity registration (§7.1) through every step of the flow (pre-consent, complete-consent, data request, revoke). It's echoed in the IDP callback (§8.2), the AS callback (§8.4), and every status callback — always the same value the RP originally sent here.  
> **`request_params`** is a JSON-stringified object. To NDID's platform it's an opaque string (`request_params: { type: 'string' }` on this on-chain endpoint's route schema — no `minLength`, so an empty string technically passes; the separate off-chain `/v7/yourdata/rp/requests` endpoint used in §9.1/§10.1 *does* enforce `minLength: 1`) — the platform never parses it, only the AS does. Every dataset carries `usage_type` + `data_service_list`, plus a dataset-specific set of fields defined by NDID's [YourData_Schema_Common](https://app.swaggerhub.com/apis/NDID/YourData_Schema_Common/1.0.1) reference schema:
> - **Deposit**: `language` (`TH`/`EN`, mandatory) + `accountSubType` (mandatory — the spec ships only an example value, `SAVINGS`, with no formal enum; in practice AS's also accept `CURRENT`, `TERM`, and `ALL` for every subtype) + `auxiliaryReferenceId` (optional, 1–50 chars, echoed back by the AS if provided)
> - **Card Payment / e-Money** (shown above for Card Payment): `language` (mandatory) + `auxiliaryReferenceId` (optional) — no `accountSubType`
> - **Loan**: `language` (mandatory) + `loanTypeCode` (mandatory — not `accountSubType`) + `auxiliaryReferenceId` (optional)
>
> **There's no "omit and get a default" option anymore for Basic/Detail or lookback period** — since the v1.0.1 schemas, each tier × lookback combination is its own distinct `service_id` (§4), so the RP always picks one explicitly by which `service_id` it names in `data_service_list`. `service_extension` itself is no longer used in this `data_service_list` context at all.
>
> **`expiration_datetime` (for `usage_type: "continuous_with_expire"`) lives at the same level as `usage_type`** — a single value for the whole intent, not nested inside each `data_service_list` entry: `{"usage_type": "continuous_with_expire", "expiration_datetime": 1757808000, "data_service_list": [...], ...}`. Not shown in the example above since it's a `one_time` request; omitted entirely for `one_time`/`continuous_no_expire`, same as at token creation (§9.3).

**NDID sync response:**
```json
{ "request_id": "req-pre-xxxx", "initial_salt": "<salt>" }
```

### 8.2 IDP: Incoming Request Callback

Callback → `POST /idp/request`:
```json
{
  "node_id": "idp1",
  "type": "incoming_request",
  "mode": 2,
  "request_id": "req-pre-xxxx",
  "reference_group_code": "rg-xxxx",
  "request_message": "Please consent to share your data (REF: pre-consent-xxx)",
  "request_message_hash": "<sha256-hash>",
  "request_message_salt": "<salt>",
  "requester_node_id": "rp1",
  "min_ial": 2.3,
  "min_aal": 2.1,
  "data_request_list": [
    { "service_id": "900.pre_consent_deposit_001", "as_id_list": ["as1", "as2"], "min_as": 0 }
  ],
  "initial_salt": "<salt>",
  "request_type": "AuthenOnly",
  "creation_time": 1750000000000,
  "creation_block_height": "12345:1",
  "request_timeout": 600
}
```

> `reference_group_code` is present because the identity was already onboarded in Step 1 — if it hadn't been (or for mode 1), `namespace`/`identifier` appear instead. `data_request_list` here is stripped down to `{service_id, as_id_list, min_as}` only — `request_params` is not echoed back to the IDP.

> `request_message` may contain `\n` for line breaks — the IDP's consent-screen UI should render these as actual newlines, not display the literal `\n` characters.

IDP shows the user a consent screen. User taps **Approve**.

### 8.3 IDP: Respond to NDID

```
POST /v7/idp/response
```
```json
{
  "reference_id": "idp-response-pre-consent-xxx",
  "callback_url": "http://idp-cb:6000/idp/response_result",
  "request_id": "req-pre-xxxx",
  "ial": 2.3,
  "aal": 2.1,
  "status": "accept",
  "accessor_id": "acc-xxxx",
  "signature": "<base64-rsa-sig>"
}
```

> `reference_id`/`callback_url` here are the **IDP's own** async-result tracking (not the RP's) — required unconditionally by the route schema, regardless of whether `status` is `accept` or `reject`. `namespace`/`identifier` are not part of this endpoint's body at all.

### 8.4 AS: Pre-consent Callback (one per dataset × AS)

Callback → `POST /as/service/{service_id}` — example for `900.pre_consent_deposit_001` → `as1`:
```json
{
  "node_id": "as1",
  "type": "data_request",
  "request_id": "req-pre-xxxx",
  "mode": 2,
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "service_id": "900.pre_consent_deposit_001",
  "requester_node_id": "rp1",
  "request_params": "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_basic_001\",\"service_version\":\"v1\"}],\"language\":\"EN\",\"accountSubType\":\"ALL\",\"auxiliaryReferenceId\":\"aux-pre-consent-1750000000000\"}",
  "response_signature_list": ["<base64-signature>"],
  "max_ial": 2.3,
  "max_aal": 2.1,
  "request_type": "AuthenOnly",
  "creation_time": 1750000000000,
  "creation_block_height": "12345:1",
  "request_timeout": 600
}
```

### 8.5 AS: Create as_token

```
POST /v7/yourdata/utility/token
```
```json
{
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "source_request_id_list": ["req-pre-xxxx"],
  "usage_type": "one_time",
  "expiration_datetime": 1750000900,
  "validate_identifier": true,
  "validate_service_id": true,
  "validate_service_extension": false,
  "service_id_list": [
    {
      "service_id": "900.complete_consent_001",
      "service_version": "v1",
      "service_extension": [
        "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_basic_001\",\"service_version\":\"v1\"}]}"
      ]
    }
  ]
}
```

> The `service_extension[0]` on `complete_consent_001` carries the original intent (usage_type + data_service_list, plus `expiration_datetime` alongside `usage_type` when it's `continuous_with_expire` — same placement as §8.1) so the AS can reconstruct it during complete-consent without the RP re-sending it.
>
> **The embedded `data_service_list` reflects only what this AS can actually provide.** The RP's requested `data_service_list` (from the pre-consent callback, §8.4) may include more service_ids than a given AS supports — the AS includes only the service_ids it can genuinely serve in the intent it embeds here, silently omitting the rest. **If none of the requested service_ids can be provided at all, the AS responds with error `40400` (Invalid data)** instead of creating an as_token with an empty `data_service_list`. This decision is made once, here at pre-consent — complete-consent (§9.3) just honors whatever was resolved into this embedded intent.
>
> **There's no AS-side defaulting for Basic/Detail or Lookback anymore.** Since the v1.0.1 schemas fold both choices into the concrete `service_id` the RP picked at pre-consent (§4, §8.1), the AS doesn't guess or fill anything in here — it just carries the RP's exact `service_id` through into the embedded intent unchanged. Like the provide/omit decision above, this is resolved once at pre-consent and simply carried through at complete-consent.

### 8.6 AS: Respond to NDID with Masked Accounts + as_token

```
POST /v7/as/data/req-pre-xxxx/900.pre_consent_deposit_001
```

> `request_id` and `service_id` are **URL path params**, not body fields.

```json
{
  "reference_id": "ndid-data-deposit-as1",
  "callback_url": "http://as-cb:6002/as/response",
  "data": "{\"auxiliaryReferenceId\":\"aux-pre-consent-1750000000000\",\"sub_identity_list\":[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"******1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\",\\\"institutionName\\\":\\\"Alpha Bank\\\",\\\"accountStatus\\\":\\\"ACTIVE\\\",\\\"accountName\\\":\\\"John Doe\\\"}\"}],\"authorization\":\"<as_token JWT>\"}"
}
```

> `auxiliaryReferenceId` echoes back the value the RP sent in `request_params` — a caller-supplied correlation ID for the RP's own bookkeeping (not generated or interpreted by NDID). `identifier_extension` is itself a JSON string, and — like `sub_identity_list` and `data` above — NDID's platform never parses it either; the shape below is purely an AS/dataset-schema convention. It's dataset-specific:
> - **Deposit** (shown above): `accountSubType`, `institutionName`, `accountStatus`, `accountName`
> - **e-Money**: `institutionName`, `accountStatus`, `accountName` — no `accountSubType`
> - **Card Payment**: `issuerName`, `cardStatus`, `isPrimary`, `cardType`
> - **Loan**: `accountName`, `institutionCode`, `institutionName`, `loanTypeCode`, `loanTypePersonalRegCode`
>
> per NDID's [YourData_Schema_Common](https://app.swaggerhub.com/apis/NDID/YourData_Schema_Common/1.0.1) reference schema.

### 8.7 RP: Status Callback (completed)

Callback → `POST /rp/request/{reference_id}`:
```json
{
  "node_id": "rp1",
  "type": "request_status",
  "request_id": "req-pre-xxxx",
  "requester_node_id": "rp1",
  "mode": 2,
  "request_message_hash": "<sha256-hash>",
  "min_ial": 2.3,
  "min_aal": 2.1,
  "min_idp": 1,
  "idp_id_list": ["idp1"],
  "response_list": [
    { "idp_id": "idp1", "valid_signature": true, "valid_ial": true }
  ],
  "data_request_list": [
    {
      "service_id": "900.pre_consent_deposit_001",
      "as_id_list": ["as1", "as2"],
      "response_list": [
        { "as_id": "as1", "signed": true, "received_data": true },
        { "as_id": "as2", "signed": true, "received_data": true }
      ]
    }
  ],
  "request_type": "AuthenOnly",
  "request_timeout": 600,
  "status": "completed",
  "closed": true,
  "timed_out": false,
  "block_height": "12345:5"
}
```

> The top-level `response_list` is about **IDP** responses (`idp_id`, `valid_signature`, `valid_ial`); the `response_list` nested inside each `data_request_list` entry is about **AS** responses per service (`as_id`, `signed`, `received_data`) — two different things at different nesting levels.  
> `request_type` is passed straight through from the on-chain request detail (only `purpose`/`creation_chain_id`/`creation_block_height` are stripped) — it's present here too, same value as what the RP originally sent in §8.1.

### 8.8 RP: Retrieve Masked Account Lists

```
GET /v7/rp/request_data/req-pre-xxxx
```

**Response** (one entry per dataset × AS):
```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.pre_consent_deposit_001",
    "source_signature": "<base64-signature>",
    "signature_signing_algorithm": "RSASSA_PKCS1_V1_5_SHA_256",
    "signature_signing_key_version": 1,
    "data_salt": "<salt>",
    "data": "{\"auxiliaryReferenceId\":\"aux-pre-consent-1750000000000\",\"sub_identity_list\":[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"******1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\",\\\"institutionName\\\":\\\"Alpha Bank\\\",\\\"accountStatus\\\":\\\"ACTIVE\\\",\\\"accountName\\\":\\\"John Doe\\\"}\"}]}"
  },
  {
    "source_node_id": "as2",
    "service_id": "900.pre_consent_deposit_001",
    "source_signature": "<base64-signature>",
    "signature_signing_algorithm": "RSASSA_PKCS1_V1_5_SHA_256",
    "signature_signing_key_version": 1,
    "data_salt": "<salt>",
    "data": "{\"auxiliaryReferenceId\":\"aux-pre-consent-1750000000000\",\"sub_identity_list\":[{\"namespace\":\"account_id\",\"identifier\":\"beta-dep-c9d0e1f2\",\"visible_identifier\":\"******9001\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\",\\\"institutionName\\\":\\\"Beta Bank\\\",\\\"accountStatus\\\":\\\"ACTIVE\\\",\\\"accountName\\\":\\\"John Doe\\\"}\"}]}"
  }
]
```

> `source_signature`/`signature_signing_algorithm`/`signature_signing_key_version`/`data_salt` are always present here — same signing mechanism as the YourData-specific retrieve-data endpoint (§9.5).  
> **RP stores** `as_token` server-side keyed by `(request_id, dataset, as_node_id)`. NDID's platform never parses or strips anything from `data` — it's an opaque string end to end. If the AS embedded `authorization` inside `data` (as shown in §8.6), it's **still in there** when this response arrives; it's the RP's own application responsibility to parse `data` and not forward the raw `authorization`/`as_token` to its client.

---

## 9. Step 3 — Complete-Consent

**Parties:** RP → NDID → AS (no IDP)  
**One request per pre-consent token** = one request per (dataset × AS).

The number of complete-consent calls = number of (dataset × AS) combinations that received a pre-consent callback.

**Example:** Deposit → as1, Deposit → as2, Card → as1 = **3 complete-consent calls**.

### 9.1 RP: Create Complete-Consent Request

One call per pre-consent token. Shown for Deposit × as1:

```
POST /v7/yourdata/rp/requests
```
```json
{
  "service_id": "900.complete_consent_001",
  "service_version": "v1",
  "as_node_id": "as1",
  "reference_id": "cc-deposit-as1-1750000000001",
  "callback_url": "http://rp-cb:6001/yourdata/rp/request_status_update",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "request_params": "[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"******1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\",\\\"institutionName\\\":\\\"Alpha Bank\\\",\\\"accountStatus\\\":\\\"ACTIVE\\\",\\\"accountName\\\":\\\"John Doe\\\"}\"}]",
  "authorization": "<as_token for (Deposit x as1)>",
  "request_timeout": 900
}
```

> `request_params` = JSON-stringified array of **selected account objects** (exact objects from pre-consent `sub_identity_list`). Empty array `[]` = consent to all accounts.
>
> **Max 5 accounts per dataset.** If the RP selects more than 5 accounts for a single (dataset × AS) complete-consent call, the AS responds with error `40400` (Invalid data) — same error family as an empty/malformed selection. This is a per-call limit: a user consenting to, say, 8 Deposit accounts across `as1`/`as2` needs multiple complete-consent calls (still one per pre-consent token / (dataset × AS) pair as noted above), each selecting 5 or fewer.

> `authorization` = the `as_token` from the pre-consent callback for this (dataset × AS). Never sent by the client — RP resolves it from `(pre_consent_request_id, dataset, as_node_id)`.

### 9.2 AS: Complete-Consent Callback

Callback → `POST /yourdata/as/request/900.complete_consent_001`:
```json
{
  "node_id": "as1",
  "type": "yourdata.data_request",
  "request_id": "req-cc-deposit-as1",
  "service_id": "900.complete_consent_001",
  "service_version": "v1",
  "requester_node_id": "rp1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "request_params": "[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",...}]",
  "authorization": "<as_token JWT>",
  "request_time": 1750000000000,
  "request_timeout": 900
}
```

> The field is **`node_id`** (this AS's own node ID), not `as_node_id` — `as_node_id` is only used in the `yourdata.request_status` callback sent to the RP (§9.5), which needs to name *which* AS the status is about.
>
> **The same platform-side validation gate as §10.2 runs before this callback fires too** — it's the literal same handler function, triggered by the same message type, for both `900.complete_consent_001` (here) and every real dataset request (§10.1). That means: this AS must have `900.complete_consent_001` itself registered as a service (§3), the request must not be timed out, the `as_token`'s signature must verify, the requester node must be valid, the namespace must be supported, and the token's `usage_type` must map to a `supported_authorization` entry — see §10.2's numbered checklist for the full 7-step gate and its failure modes (auto-error codes vs. silent drop vs. hard rejection). Nothing below in §9.3 runs unless all of that already passed.

### 9.3 AS: Create Consent Tokens

Number of `/v7/yourdata/utility/token` calls depends on `usage_type`:

| `usage_type` | Calls | `service_id_list` per call |
|---|---|---|
| `one_time` | accounts × services | 1 service_id |
| `continuous_*` | accounts | All selected service_ids |

**Example — one_time, 1 account selected, 2 services:**

```
POST /v7/yourdata/utility/token   ← Token 1/2 (account × deposit_transactions)
POST /v7/yourdata/utility/token   ← Token 2/2 (account × deposit_balance)
```

Token create body (token 1/2, `one_time`):
```json
{
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "source_request_id_list": ["req-pre-xxxx", "req-cc-deposit-as1"],
  "usage_type": "one_time",
  "expiration_datetime": 1752592000,
  "validate_identifier": true,
  "validate_service_id": true,
  "validate_service_extension": true,
  "service_id_list": [
    { "service_id": "900.deposit_transactions_basic_001", "service_version": "v1", "service_extension": [] }
  ],
  "sub_identity_list": [
    {
      "namespace": "account_id",
      "identifier": "1234561234",
      "visible_identifier": "1234561234",
      "identifier_extension": "{\"accountSubType\":\"CURRENT\",\"institutionName\":\"Alpha Bank\",\"accountStatus\":\"ACTIVE\",\"accountName\":\"John Doe\"}"
    }
  ]
}
```

> **Both `identifier` and `visible_identifier` in `sub_identity_list` become the real account number** — not the opaque pre-consent identifier, and not the masked display string either. Masking only matters pre-consent, before the user has confirmed a specific account (§8.6/§8.8); once the AS is creating the actual consent_token for a confirmed account, there's nothing left to mask, so both fields carry the same real value. This unmasking only applies to **Deposit and Loan**; Card Payment keeps the same opaque/masked value for `identifier` and the same masked `visible_identifier` (PCI-DSS) — neither field changes — and e-Money's `identifier` was already the AS's internal ID from pre-consent onward with `visible_identifier` staying masked (see Key Design Principles above).  
> `source_request_id_list` must include **both** the pre-consent request_id and this complete-consent request_id.  
> `expiration_datetime` is **required for every `usage_type` except `continuous_no_expire`** — token creation fails with `TOKEN_MUST_HAVE_EXPIRATION_TIME` otherwise. Give `one_time` consent_tokens a real redemption window — **24 hours** (the industry-standard window for this token type) — to actually be redeemed via Step 4, not just a few minutes.
>
> `service_id_list` here reflects only what this AS decided it can actually provide **at pre-consent** (§8.5) — the filtering/40400 decision already happened when the as_token's embedded intent was created; complete-consent just honors it.

Token create body (token 1, `continuous_with_expire`, all services):
```json
{
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "source_request_id_list": ["req-pre-xxxx", "req-cc-deposit-as1"],
  "usage_type": "continuous_with_expire",
  "expiration_datetime": 1757808000,
  "validate_identifier": true,
  "validate_service_id": true,
  "validate_service_extension": true,
  "service_id_list": [
    { "service_id": "900.deposit_transactions_basic_001", "service_version": "v1", "service_extension": [] },
    { "service_id": "900.deposit_balance_001", "service_version": "v1", "service_extension": [] }
  ],
  "sub_identity_list": [
    { "namespace": "account_id", "identifier": "1234561234", "visible_identifier": "1234561234", "identifier_extension": "{\"accountSubType\":\"CURRENT\",\"institutionName\":\"Alpha Bank\",\"accountStatus\":\"ACTIVE\",\"accountName\":\"John Doe\"}" }
  ]
}
```

### 9.4 AS: Send Consent Tokens to NDID

```
POST /v7/yourdata/as/data
```
```json
{
  "request_id": "req-cc-deposit-as1",
  "data": "[\"<consent_token_JWT_1>\",\"<consent_token_JWT_2>\"]"
}
```

### 9.5 RP: Status Callback + Retrieve Result

**Status callback** → `POST /yourdata/rp/request_status_update`:
```json
{
  "node_id": "rp1",
  "type": "yourdata.request_status",
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "request_id": "req-cc-deposit-as1",
  "request_timeout": 900,
  "status": "completed",
  "timed_out": false
}
```

> `status` also has a terminal error state, sent instead of `completed` if the AS reported an error (e.g. via `POST /yourdata/as/error`, or an auto-error response per §10.2): `{"status": "errored", "error_code": 40720, "error_message": "Consent Token Revoked", ...same other fields as above}` — `error_code` and `error_message` only appear on this branch.

**RP retrieves and decodes tokens:**
```
GET /v7/yourdata/rp/request_data/req-cc-deposit-as1
```

**Response** (RP decodes each JWT, maps `visible_identifier` → opaque accountId, stores token server-side):
```json
{
  "source_node_id": "as1",
  "service_id": "900.complete_consent_001",
  "source_signature": "<base64-signature>",
  "signature_signing_algorithm": "RSASSA_PKCS1_V1_5_SHA_256",
  "signature_signing_key_version": 1,
  "data_salt": "<salt>",
  "data": "[\"alpha-dep-a1b2c3d4\"]"
}
```

> Client receives only the opaque `accountId` array. Raw `consent_token` JWTs are stored server-side keyed by `(accountId, service_id)`.  
> Each decoded JWT payload includes a **`token_id`** (a UUID the AS generated when it created the token via `POST /v7/yourdata/utility/token`). The RP extracts and stores this `token_id` alongside `as_node_id` — both are required later to revoke the token (see [Step 5](#11-step-5--revoke-consent-on-chain)); the raw JWT itself is never resent.  
> `source_signature`/`signature_signing_algorithm`/`signature_signing_key_version`/`data_salt` are how the RP's node verifies `data` wasn't tampered with in transit — the AS's node signs `data + data_salt` before sending; these four fields are always present on every `request_data` response, not just this one. `signature_signing_algorithm` is one of `RSASSA_PKCS1_V1_5_SHA_256/384/512`, `RSASSA_PSS_SHA_256/384/512`, `ECDSA_SHA_256/384`, or `Ed25519`.

---

## 10. Step 4 — Request Data

**Parties:** RP → NDID → AS (no IDP)  
**One request per (account × service)** for `one_time`, or per account for recurring.

### 10.1 RP: Create Data Request

```
POST /v7/yourdata/rp/requests
```

Example — Deposit Transactions Basic:
```json
{
  "service_id": "900.deposit_transactions_basic_001",
  "service_version": "v1",
  "as_node_id": "as1",
  "reference_id": "data-request-1750000000002",
  "callback_url": "http://rp-cb:6001/yourdata/rp/request_status_update",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "request_params": "{\"fromBookingDateTime\":\"2026-01-01T00:00:00+07:00\",\"toBookingDateTime\":\"2026-03-31T23:59:59+07:00\",\"language\":\"EN\"}",
  "authorization": "<consent_token>",
  "request_timeout": 900,
  "service_extension": []
}
```

> `authorization` = consent_token resolved by RP from `(accountId, service_id)`. Never sent by the client.  
> Which tier (Basic/Detail) and lookback period (6mo/12mo) applies is fully determined by which of the 8 split `service_id`s (§4) the RP calls — `service_extension` no longer carries that. This example shows the RP sending `service_extension: []` explicitly, matching the consent_token's (§9.3) own explicit `service_extension: []` on its `service_id_list`.

### 10.2 AS: Data Request Callback

Callback → `POST /yourdata/as/request/{service_id}`:
```json
{
  "node_id": "as1",
  "type": "yourdata.data_request",
  "request_id": "req-data-xxxx",
  "service_id": "900.deposit_transactions_basic_001",
  "service_version": "v1",
  "service_extension": [],
  "requester_node_id": "rp1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "request_params": "{\"fromBookingDateTime\":\"2026-01-01T00:00:00+07:00\",\"toBookingDateTime\":\"2026-03-31T23:59:59+07:00\",\"language\":\"EN\"}",
  "authorization": "<consent_token JWT>",
  "request_time": 1750000000000,
  "request_timeout": 900
}
```

> **What the platform already validated before this callback was even sent** — the checks below run inside NDID's own node software (on the AS's node), fully automatically, **before** your registered `service_url` is ever called:
>
> 1. **Request not yet timed out** — `request_time + request_timeout` hasn't elapsed (checked again here in case this message arrived late due to a retry).
> 2. **Token signature valid** — `authorization` JWT signature verified against the AS's own signing public key (by `as_node_signing_key_version`).
> 3. **Requester (RP) node is valid** — exists on-chain, is `active`, and holds YourData domain permission. (If any of these fail, the request is silently dropped — no error callback, since the caller isn't a legitimate node to respond to.)
> 4. **Service is registered and enabled** — `service_id` was registered via `POST /v7/yourdata/as/service/{service_id}` (§3) and its `service_availability` is `true`. Otherwise → auto-error `40740`/`40750` *if* you configured an auto-error-response for it (see below), else silently dropped.
> 5. **Namespace is supported** — the request's `namespace` is in that service's registered `supported_namespace_list`. Otherwise → auto-error `40760` if configured.
> 6. **Authorization type is supported** — the token's `usage_type` maps to a `supported_authorization` entry registered for this service (`one_time`→`token_one_time`, etc). Otherwise → auto-error `40770` if configured.
> 7. **Token content matches the request** — token not expired (unless `continuous_no_expire`); `requester_node_id` and `as_node_id` embedded in the token match the actual caller/callee; and if `validate_identifier`/`validate_service_id`/`validate_service_extension` (§6) are `true` on the token, the request's `namespace`+`identifier`, `service_id`, and `service_extension` are cross-checked against what's embedded in the token. Any mismatch here is a hard platform-level rejection — not something your application ever sees or handles.
>
> **Auto-error responses for checks 4–6 are opt-in** — register them via the AS auto-error-response config (per node, keyed by `unsupported_service` / `service_not_available` / `unsupported_namespace` / `unsupported_authorization`) if you want RP to receive a proper domain error code (`40740`–`40770`) instead of the request simply timing out silently.
>
> Only **after all of the above pass** does the platform invoke your `service_url` with the `yourdata.data_request` callback body shown above — meaning by the time your application code runs, the caller, the token, and the requested service/namespace/extension are already known-good. The rest — building and returning the actual data response — is your application's job; the extra checks in §10.3 (revocation, one-time reuse, date-range/lookback) are **optional**, since NDID doesn't track that state for you either way.

### 10.3 AS Application: Business-Level Validation (your responsibility)

These checks are **not required or enforced by NDID** — the platform-level validation in §10.2 is all that's mandatory. Everything below is optional business logic an AS **may** choose to implement on top of that, based on its own risk/compliance needs:

```
1. revokedTokens.has(authorization)          → error 40720 (Consent Token Revoked)
2. usage_type=one_time && already used       → error 40730 (One-Time Token Already Used)
3. earliestAllowedFromDate = service_id ends in "_002" ? today minus 12 CALENDAR months
                           : today minus 6 CALENDAR months   // "_001" = 6mo
   fromDate < earliestAllowedFromDate           → error 40710 (Date Range Exceeds Permission)
4. tokenAccountMap.get(authorization)        → get account details
5. Build response matching dataset schema
6. responseSize > platform's size limit       → error 40780 (AS Data Size Larger Than Limit)
```

> The lookback period is **calendar-month offsets from today, not fixed day counts** (180/365 days) — months vary in length (28–31 days), so a fixed day count drifts from the actual month boundary. Subtract calendar months from today's date instead: if today is **2026-07-27**, a 6-month lookback allows data back to **2026-01-27**, and 12-month allows data back to **2025-07-27** — not "180/365 days ago."
>
> There's no ambiguity or AS-side defaulting here anymore: since the v1.0.1 schemas, the lookback period is baked directly into which `service_id` (§4) the RP calls at Step 4 — `_001` for 6 months, `_002` for 12 months. The RP committed to one specific `service_id` back at pre-consent (§8.1) and complete-consent (§9.3), and Step 4 must call that exact same one.

### 10.4 AS: Send Data

```
POST /v7/yourdata/as/data
```

Example response body for `900.deposit_transactions_basic_001`:
```json
{
  "request_id": "req-data-xxxx",
  "data": "{\"accountId\":\"1234561234\",\"transactionEntries\":[{\"transactionId\":\"TXN-A-001\",\"bookingDateTime\":\"2026-06-01T00:00:00+07:00\",\"domainCode\":\"PMNT\",\"familyCode\":\"RCDT\",\"subFamilyCode\":\"SALA\",\"proprietaryBankTransactionCode\":\"TW\",\"proprietaryBankTransactionDescription\":\"Transfer in\",\"creditDebitIndicator\":\"CRDT\",\"amount\":5000,\"amountCurrency\":\"THB\"}]}"
}
```

Calling `900.deposit_transactions_detail_001`/`_002` instead of the `_basic_` variant adds 11 more fields per entry — see §10.7 "Deposit — Transactions (Detail)" for the full set (`transactionRef`, `transactionInformation`, `creditorAccountId`/`Name`, `sendingInstitutionCode`/`Name`, `receivingInstitutionCode`/`Name`, `merchantName`, `debtorAccountId`/`Name`).

### 10.5 RP: Retrieve Data

**Status callback** → `POST /yourdata/rp/request_status_update`:
```json
{
  "node_id": "rp1",
  "type": "yourdata.request_status",
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "request_id": "req-data-xxxx",
  "request_timeout": 900,
  "status": "completed",
  "timed_out": false
}
```

```
GET /v7/yourdata/rp/request_data/req-data-xxxx
```

### 10.6 Retry Decryption Key

RP receives a status callback stuck at `data_decryption_key_requested` with `timed_out: true` — this is what triggers the retry, not a `completed`/`errored` terminal status:

```json
{
  "node_id": "rp1",
  "type": "yourdata.request_status",
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "request_id": "req-data-xxxx",
  "request_timeout": 900,
  "status": "data_decryption_key_requested",
  "timed_out": true
}
```

RP then calls:

```
POST /v7/yourdata/rp/data_decryption_key_retry_requests
```
```json
{
  "request_id": "req-data-xxxx",
  "reference_id": "retry-xxx",
  "callback_url": "http://rp-cb:6001/yourdata/rp/data_decryption_key_retry_request_status_update",
  "request_timeout": 900
}
```

**Retry status callback** → `POST /yourdata/rp/data_decryption_key_retry_request_status_update`:
```json
{
  "node_id": "rp1",
  "type": "yourdata.data_decryption_key_retry_request_status",
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "request_id": "req-data-xxxx",
  "request_timeout": 900,
  "status": "completed",
  "timed_out": false
}
```

> Note the different `type` here — `yourdata.data_decryption_key_retry_request_status`, not `yourdata.request_status`. Every callback in the retry flow (pending, timeout, and this completed one) uses this distinct type; only the original "stuck" callback above (before the retry was requested) uses `yourdata.request_status`.

RP retrieves the data the same way as before:

```
GET /v7/yourdata/rp/request_data/req-data-xxxx
```
```json
{
  "source_node_id": "as1",
  "service_id": "900.deposit_transactions_basic_001",
  "source_signature": "<base64-signature>",
  "signature_signing_algorithm": "RSASSA_PKCS1_V1_5_SHA_256",
  "signature_signing_key_version": 1,
  "data_salt": "<salt>",
  "data": "{\"accountId\":\"1234561234\",\"transactionEntries\":[{\"transactionId\":\"TXN-A-001\",\"bookingDateTime\":\"2026-06-01T00:00:00+07:00\",\"domainCode\":\"PMNT\",\"familyCode\":\"RCDT\",\"subFamilyCode\":\"SALA\",\"proprietaryBankTransactionCode\":\"TW\",\"proprietaryBankTransactionDescription\":\"Transfer in\",\"creditDebitIndicator\":\"CRDT\",\"amount\":5000,\"amountCurrency\":\"THB\"}]}"
}
```
> See §9.5 for what `source_signature`/`signature_signing_algorithm`/`signature_signing_key_version`/`data_salt` are for — they're present on every `request_data` response.

### 10.7 Data Response Examples by Service

> Field names below are taken directly from the real `YourData_Schema_*` OpenAPI specs (SwaggerHub `NDID/YourData_Schema_{Deposit,EMoney,CardPayment,Loan}` v1.0.1, updated 27 Aug 2026), not invented mocks. Endpoints without a Basic/Detail split (Account, Balance, Outstanding Balance, Scheduled Payment everywhere; Statement for Card Payment/Loan) have exactly one response shape.

#### Deposit — Account *(single response — no Basic/Detail)*
```json
{
  "institutionName": "ABCB",
  "accountId": "1234561234",
  "ownerType": "INDIVIDUAL",
  "accountType": "DEPOSIT",
  "accountSubType": "SAVINGS",
  "accountStatus": "ACTIVE",
  "accountName": "Mr. Somchai Jaidee",
  "accountOwner": "SINGLE",
  "openingDate": "2020-01-01T00:00:00+07:00",
  "auxiliaryReferenceId": "",
  "homeBranch": "Silom Branch"
}
```
> `auxiliaryReferenceId` is optional and bank-defined (often left empty unless the AS uses it for internal cross-referencing); `homeBranch` is optional.

#### Deposit — Balance
```json
{
  "accountId": "1234561234",
  "lastLedgerBalanceAmount": 85000.50,
  "lastLedgerBalanceCurrency": "THB",
  "lastAvailableBalanceAmount": 85000.50,
  "lastAvailableBalanceCurrency": "THB",
  "creditLimit": 50000,
  "auxiliaryReferenceId": ""
}
```

#### Deposit — Transactions (Basic)
```json
{
  "accountId": "1234561234",
  "transactionEntries": [
    {
      "transactionId": "TXN-A-001",
      "bookingDateTime": "2026-06-01T00:00:00+07:00",
      "valueDateTime": "2026-06-01T00:00:00+07:00",
      "domainCode": "PMNT",
      "familyCode": "RCDT",
      "subFamilyCode": "SALA",
      "proprietaryBankTransactionCode": "TW",
      "proprietaryBankTransactionDescription": "Transfer in",
      "creditDebitIndicator": "CRDT",
      "amount": 5000,
      "amountCurrency": "THB",
      "subAccountLevelMaturityDate": null
    }
  ]
}
```
> `valueDateTime` is optional. `subAccountLevelMaturityDate` is optional and only meaningful when `accountSubType` is `TERM` (a term/fixed deposit sub-account) — `null`/omitted for a `SAVINGS` account like this example.

#### Deposit — Transactions (Detail) — each entry additionally includes:
```json
{
  "transactionRef": "REF-0001",
  "transactionInformation": "Salary payment",
  "debtorAccountId": "1112223333",
  "debtorAccountName": "ABC COMPANY LTD",
  "creditorAccountId": "1234561234",
  "creditorAccountName": "Mr. Somchai Jaidee",
  "sendingInstitutionCode": "XYZB",
  "sendingInstitutionName": "XYZ Bank",
  "receivingInstitutionCode": "ABCB",
  "receivingInstitutionName": "ABC Bank",
  "merchantName": ""
}
```
> This example is a `CRDT` (money-in) transaction, so the debtor/sending fields identify the external payer and the creditor/receiving fields identify this account — for a `DBIT` transaction the roles swap. `merchantName` is optional and populated only for card/QR merchant transactions.

#### Deposit — Statement (Basic) *(`StatementHeader` fields + entries)*
```json
{
  "creationDateTime": "2026-07-01T00:00:00+07:00",
  "statementId": "STMT-2026-06",
  "institutionName": "ABCB",
  "accountId": "1234561234",
  "ownerType": "INDIVIDUAL",
  "accountType": "DEPOSIT",
  "accountSubType": "SAVINGS",
  "accountStatus": "ACTIVE",
  "accountName": "Mr. Somchai Jaidee",
  "accountOwner": "SINGLE",
  "openingDate": "2020-01-01T00:00:00+07:00",
  "auxiliaryReferenceId": "",
  "homeBranch": "Silom Branch",
  "accountLevelMaturityDate": null,
  "lastLedgerBalanceAmount": 85000.50,
  "lastLedgerBalanceCurrency": "THB",
  "lastAvailableBalanceAmount": 85000.50,
  "lastAvailableBalanceCurrency": "THB",
  "creditLimit": 50000,
  "statementDescription": "Monthly savings account statement",
  "startDateTime": "2026-06-01T00:00:00+07:00",
  "endDateTime": "2026-06-30T23:59:59+07:00",
  "numberofTotalItems": 1,
  "statementEntries": [
    {
      "transactionId": "TXN-A-001",
      "bookingDateTime": "2026-06-01T00:00:00+07:00",
      "domainCode": "PMNT",
      "familyCode": "RCDT",
      "subFamilyCode": "SALA",
      "proprietaryBankTransactionCode": "TW",
      "proprietaryBankTransactionDescription": "Transfer in",
      "creditDebitIndicator": "CRDT",
      "amount": 5000,
      "amountCurrency": "THB",
      "balance": 85000.50,
      "balanceCurrency": "THB",
      "originCode": "BR001",
      "originDescription": "Branch teller",
      "processingBranchCode": "BR001",
      "processingBranchDescription": "Silom Branch"
    }
  ]
}
```
> `auxiliaryReferenceId`, `lastAvailableBalanceAmount`/`lastAvailableBalanceCurrency`, `statementDescription`, `creditLimit`, and `homeBranch` are optional. `accountLevelMaturityDate` is conditional — only meaningful for `TERM` (fixed deposit) accounts, `null`/omitted otherwise as shown here.

#### Deposit — Statement (Detail) — each entry additionally includes the same fields as Transactions (Detail).

#### Card Payment — Account *(single response — no Basic/Detail)*
```json
{
  "cardNumber": "411111XXXXXX1111",
  "cardName": "Mr. Somchai Jaidee",
  "cardType": "CREDIT",
  "issuerName": "ABCB",
  "cardBrand": "VISA",
  "productName": "ABCB Platinum",
  "ownerType": "INDIVIDUAL",
  "cardStatus": "ACTIVE",
  "isPrimary": true,
  "auxiliaryReferenceId": "aux-cardpayment-account-001"
}
```

#### Card Payment — Outstanding Balance
```json
{
  "cardNumber": "411111XXXXXX1111",
  "creditInfo": [
    {
      "creditLimitAmount": 100000,
      "creditLimitCurrency": "THB",
      "availableCreditAmount": 87500,
      "availableCreditCurrency": "THB",
      "outstandingBalanceAmount": 12500,
      "outstandingBalanceCurrency": "THB"
    }
  ],
  "auxiliaryReferenceId": "aux-cardpayment-outstandingbalance-001"
}
```

#### Card Payment — Transactions (Basic)
```json
{
  "cardNumber": "411111XXXXXX1111",
  "transactionEntries": [
    {
      "transactionId": "CC-001",
      "transactionDate": "2026-05-03",
      "postingDate": "2026-05-04",
      "creditDebitIndicator": "DBIT",
      "amount": 3500,
      "amountCurrency": "THB",
      "transactionType": "SPENDING",
      "merchantCategoryCode": "5311"
    }
  ],
  "auxiliaryReferenceId": "aux-cardpayment-transactions-001"
}
```

#### Card Payment — Transactions (Detail) — each entry additionally includes:
```json
{ "transactionDescription": "CENTRAL WORLD" }
```

#### Card Payment — Scheduled Payment *(single response — no Basic/Detail)*
```json
{
  "cardNumber": "411111XXXXXX1111",
  "creditInfo": [
    {
      "outstandingBalanceAmount": 12500,
      "outstandingBalanceCurrency": "THB",
      "minimumPaymentAmount": 625,
      "minimumPaymentCurrency": "THB",
      "interestRateBalanceAmount": 12500,
      "interestRateBalanceCurrency": "THB",
      "interestRate": 16.0
    }
  ],
  "statementDate": "2026-06",
  "statementDueDate": "2026-07-05",
  "auxiliaryReferenceId": "aux-cardpayment-scheduledpayment-001"
}
```

#### Card Payment — Statement *(single response — no Basic/Detail)*
```json
{
  "cardNumber": "411111XXXXXX1111",
  "cardName": "Mr. Somchai Jaidee",
  "cardType": "CREDIT",
  "issuerName": "ABCB",
  "cardBrand": "VISA",
  "productName": "ABCB Platinum",
  "ownerType": "INDIVIDUAL",
  "creditInfo": [
    {
      "creditLimitAmount": 100000,
      "creditLimitCurrency": "THB",
      "availableCreditAmount": 87500,
      "availableCreditCurrency": "THB",
      "outstandingBalanceAmount": 12500,
      "outstandingBalanceCurrency": "THB",
      "minimumPaymentAmount": 625,
      "minimumPaymentCurrency": "THB",
      "interestRateBalanceAmount": 12500,
      "interestRateBalanceCurrency": "THB",
      "interestRate": 16.0
    }
  ],
  "statementDate": "2026-06",
  "statementDueDate": "2026-07-05",
  "cardStatus": "ACTIVE",
  "isPrimary": true,
  "statementEntries": [
    { "transactionDate": "2026-05-03", "postingDate": "2026-05-04", "creditDebitIndicator": "DBIT", "amount": 3500, "amountCurrency": "THB", "transactionType": "SPENDING", "transactionDescription": "CENTRAL WORLD", "merchantCategoryCode": "5311", "installmentTerm": 0 }
  ],
  "auxiliaryReferenceId": "aux-cardpayment-statement-001"
}
```

#### Loan — Account *(single response — no Basic/Detail; no Transactions endpoint exists for Loan)*
```json
{
  "accountId": "5678909900",
  "accountName": "Mr. Somchai Jaidee",
  "institutionCode": "0004000000000",
  "institutionName": "ABCB",
  "loanTypeCode": "2003200002",
  "securedLoanFlag": 0,
  "revolvingFlag": 0,
  "accountStatusCode": "2001600001",
  "openingDate": "2024-01-01",
  "maturityDate": "2027-01-01",
  "contractAmount": 100000,
  "contractAmountCurrency": "THB",
  "totalNumberOfInstallment": 36,
  "installmentAmount": 3200
}
```

#### Loan — Outstanding Balance
```json
{
  "accountId": "5678909900",
  "contractRemainingAmount": 72000,
  "contractRemainingCurrency": "THB",
  "outstandingBalanceAmount": 72000,
  "outstandingBalanceCurrency": "THB",
  "paidInstallment": 9,
  "dueInstallment": 10,
  "pastDueInstallment": 0
}
```

#### Loan — Statement *(single response — no Basic/Detail)*
```json
{
  "accountId": "5678909900",
  "accountName": "Mr. Somchai Jaidee",
  "institutionCode": "0004000000000",
  "institutionName": "ABCB",
  "loanTypeCode": "2003200002",
  "securedLoanFlag": 0,
  "revolvingFlag": 0,
  "accountStatusCode": "2001600001",
  "openingDate": "2024-01-01",
  "maturityDate": "2027-01-01",
  "contractAmount": 100000,
  "contractAmountCurrency": "THB",
  "totalNumberOfInstallment": 36,
  "installmentAmount": 3200,
  "lastPaymentDate": "2026-06-01",
  "userDeclaredIncome": 50000,
  "statementEntries": [
    {
      "billDate": "2026-06",
      "duePayemntDate": "2026-06-05",
      "billAmount": 3200,
      "contractRemainingAmount": 72000,
      "contractRemainingCurrency": "THB",
      "outstandingBalanceAmount": 72000,
      "outstandingBalanceCurrency": "THB",
      "pastDueAmount": 0,
      "minimumPaymentAmount": 3200,
      "creditLimitEndOfMonth": 100000,
      "increaseCreditLimitInMonth": 0,
      "decreaseCreditLimitInMonth": 0,
      "maxOSinMonth": 75200,
      "minOSinMonth": 72000,
      "interestRate": 6.5,
      "interestAmount": 390,
      "dueInstallment": 10
    }
  ]
}
```

#### e-Money — Account *(single response — no Basic/Detail)*
```json
{
  "institutionName": "ABCB",
  "eWalletId": "081234XXXX",
  "nickName": "My Prepaid Wallet",
  "ownerType": "INDIVIDUAL",
  "accountStatus": "ACTIVE",
  "accountName": "Mr. Somchai Jaidee",
  "openingDate": "2023-01-01T00:00:00+07:00"
}
```

#### e-Money — Balance
```json
{
  "eWalletId": "081234XXXX",
  "balanceInfo": [
    {
      "lastLedgerBalanceAmount": 1500,
      "lastLedgerBalanceCurrency": "THB"
    }
  ]
}
```

#### e-Money — Transactions (Basic)
```json
{
  "eWalletId": "081234XXXX",
  "transactionEntries": [
    {
      "transactionId": "EM-001",
      "bookingDateTime": "2026-06-01T00:00:00+07:00",
      "domainCode": "PMNT",
      "familyCode": "MDOP",
      "subFamilyCode": "RPMT",
      "proprietaryeWalletTransactionCode": "PAY",
      "proprietaryeWalletTransactionDescription": "Bill payment",
      "creditDebitIndicator": "DBIT",
      "amount": 200,
      "amountCurrency": "THB"
    }
  ]
}
```

#### e-Money — Transactions (Detail) — each entry additionally includes:
```json
{ "transactionInformation": "Bill payment - utilities" }
```

#### e-Money — Statement (Basic) *(`StatementHeader` fields + entries)*
```json
{
  "creationDateTime": "2026-07-01T00:00:00+07:00",
  "statementId": "STMT-2026-06",
  "institutionName": "ABCB",
  "eWalletId": "081234XXXX",
  "nickName": "My Prepaid Wallet",
  "ownerType": "INDIVIDUAL",
  "accountStatus": "ACTIVE",
  "accountName": "Mr. Somchai Jaidee",
  "accountOwner": "SINGLE",
  "openingDate": "2023-01-01T00:00:00+07:00",
  "balanceInfo": [
    {
      "lastLedgerBalanceAmount": 1500,
      "lastLedgerBalanceCurrency": "THB"
    }
  ],
  "startDateTime": "2026-06-01T00:00:00+07:00",
  "endDateTime": "2026-06-30T23:59:59+07:00",
  "numberofTotalItems": 1,
  "statementEntries": [
    {
      "transactionId": "EM-001",
      "bookingDateTime": "2026-06-01T00:00:00+07:00",
      "domainCode": "PMNT",
      "familyCode": "MDOP",
      "subFamilyCode": "RPMT",
      "proprietaryeWalletTransactionCode": "PAY",
      "proprietaryeWalletTransactionDescription": "Bill payment",
      "creditDebitIndicator": "DBIT",
      "amount": 200,
      "amountCurrency": "THB"
    }
  ]
}
```

#### e-Money — Statement (Detail) — same additive fields as Transactions (Detail).

---

## 11. Step 5 — Revoke Consent (On-chain)

**Parties:** RP → NDID → IDP (user authentication) → AS

Identical flow structure to pre-consent. RP revokes by `token_id`, **not** by resending the raw `consent_token` JWT.

> **`token_id` origin:** when AS creates a token via `POST /v7/yourdata/utility/token` (§9.3), it generates a `token_id` (UUID) and embeds it as a claim inside the resulting `consent_token` JWT. The RP decodes each JWT exactly once — when it first receives it via `GET /v7/yourdata/rp/request_data/:id` (§9.5) — and stores `token_id` + `as_node_id` server-side alongside the accountId mapping. Revocation later just references that stored `token_id`.

### 11.1 RP: Create Revoke Request

```
POST /v7/rp/requests/citizen_id/{identifier}
```
```json
{
  "mode": 2,
  "reference_id": "revoke-1750000000003",
  "idp_id_list": ["idp1"],
  "callback_url": "http://rp-cb:6001/rp/request/revoke-xxx",
  "bypass_identity_check": false,
  "data_request_list": [
    {
      "service_id": "900.revoke_consent_001",
      "as_id_list": ["as1", "as2"],
      "min_as": 0,
      "request_params": "[\"9fcf9cbc-a8a0-4edf-a818-8ba8e86cf60f\",\"<token_id_2>\"]"
    }
  ],
  "request_message": "Please approve revoking your consent (REF: revoke-xxx)",
  "min_ial": 2.3,
  "min_aal": 2.1,
  "min_idp": 1,
  "request_timeout": 86400
}
```

> `namespace`/`identifier` are URL path params, not body fields. `bypass_identity_check` is required when `mode` is `2` or `3`.  
> `request_params` = JSON-stringified array of `token_id` strings (UUIDs) to revoke — resolved by the RP from its own stored `(accountId, service_id) → token_id` mapping, never from the client and never as the raw JWT.  
> `as_id_list` = unique AS nodes extracted from the `as_node_id` the RP stored alongside each `token_id` when it originally decoded the token.

### 11.2 IDP: Incoming Request Callback

Same structure as pre-consent. User sees "Revoke consent" screen and taps Approve.

### 11.3 AS: Revoke Callback

Callback → `POST /as/service/900.revoke_consent_001`:
```json
{
  "node_id": "as1",
  "type": "data_request",
  "request_id": "req-revoke-xxxx",
  "mode": 2,
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "service_id": "900.revoke_consent_001",
  "requester_node_id": "rp1",
  "request_params": "[\"9fcf9cbc-a8a0-4edf-a818-8ba8e86cf60f\",\"<token_id_2>\"]",
  "response_signature_list": ["<base64-signature>"],
  "max_ial": 2.3,
  "max_aal": 2.1,
  "request_type": "AuthenOnly",
  "creation_time": 1750000000000,
  "creation_block_height": "12345:2",
  "request_timeout": 86400
}
```

**AS logic:**
```
for each token_id in request_params array:
  token = ownTokenStore.get(token_id)   // AS looks up its own record by token_id -- no JWT decoding needed
  if token exists && token.as_node_id === this_node:
    revokedTokens.add(token_id)   // error 40720 on all future data requests

respond with array of revoked token_ids this AS actually found and revoked
```

> The AS never needs to decode a JWT here — it already owns the `token_id` it generated at creation time, so revocation is a direct lookup.

### 11.4 AS: Respond with Revoked Token IDs

```
POST /v7/as/data/req-revoke-xxxx/900.revoke_consent_001
```

> `request_id` and `service_id` are **URL path params**, not body fields.

```json
{
  "reference_id": "ndid-data-revoke-xxx",
  "callback_url": "http://as-cb:6002/as/response",
  "data": "[\"9fcf9cbc-a8a0-4edf-a818-8ba8e86cf60f\"]"
}
```

### 11.5 RP: Status Callback (Revoke Confirmed)

Callback → `POST /rp/request/{reference_id}`:
```json
{
  "node_id": "rp1",
  "type": "request_status",
  "request_id": "req-revoke-xxxx",
  "requester_node_id": "rp1",
  "mode": 2,
  "request_message_hash": "<sha256-hash>",
  "min_ial": 2.3,
  "min_aal": 2.1,
  "min_idp": 1,
  "idp_id_list": ["idp1"],
  "response_list": [
    { "idp_id": "idp1", "valid_signature": true, "valid_ial": true }
  ],
  "data_request_list": [
    {
      "service_id": "900.revoke_consent_001",
      "as_id_list": ["as1", "as2"],
      "response_list": [
        { "as_id": "as1", "signed": true, "received_data": true },
        { "as_id": "as2", "signed": true, "received_data": true }
      ]
    }
  ],
  "request_type": "AuthenOnly",
  "request_timeout": 86400,
  "status": "completed",
  "closed": true,
  "timed_out": false,
  "block_height": "12345:9"
}
```

> Any subsequent data request for a revoked token returns error `40720`.

---

## 12. Mock Data Reference

### AS Nodes (example)

| ID | Name |
|---|---|
| `as1` | Alpha Bank |
| `as2` | Beta Bank |

### IDP Nodes (example)

| ID | Name |
|---|---|
| `idp1` | Alpha Bank IDP |
| `idp2` | Beta Bank IDP |

### Mock Accounts per (dataset × AS)

> "Real" below is what **both** `identifier` and `visible_identifier` become at complete-consent (§9.3) for datasets that unmask (Deposit, Loan) — not just `identifier`. For datasets that don't unmask (Card Payment, e-Money), neither field changes, so no separate "Real" column is shown for them.

#### Deposit — as1 (Alpha Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `alpha-dep-a1b2c3d4` | `******1234` | `1234561234` | CurrentAccount |
| `alpha-dep-e5f6a7b8` | `******5678` | `2345675678` | Savings |

#### Deposit — as2 (Beta Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `beta-dep-c9d0e1f2` | `******9001` | `3456789001` | CurrentAccount |

#### Card Payment — as1 (Alpha Bank)

`identifier` is **never unmasked** (PCI-DSS) — the same opaque value is used at complete-consent too.

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `alpha-card-x1y2z3w4` | `411111XXXXXX1111` | `alpha-card-x1y2z3w4` (unchanged) | VISA |
| `alpha-card-m5n6p7q8` | `550000XXXXXX2222` | `alpha-card-m5n6p7q8` (unchanged) | Mastercard |

#### Card Payment — as2 (Beta Bank)

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `beta-card-r5s6t7u8` | `411122XXXXXX3333` | `beta-card-r5s6t7u8` (unchanged) | VISA |

#### Loan — as1 (Alpha Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `alpha-loan-l1m2n3o4` | `******9900` | `5678909900` | PersonalLoan |

#### Loan — as2 (Beta Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `beta-loan-p5q6r7s8` | `******9901` | `6789019901` | PersonalLoan |

#### e-Money — as1 (Alpha Bank)

Namespace is **`e_wallet_id`** (not `account_id`). `identifier` is already the AS's internal customer/wallet ID from pre-consent onward — there's no separate unmasked value at complete-consent.

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `dbe195854efe3f92` | `081234XXXX` | `dbe195854efe3f92` (unchanged) | Prepaid |

#### e-Money — as2 (Beta Bank)

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `446a54fa7158df52` | `089567XXXX` | `446a54fa7158df52` (unchanged) | Prepaid |

### Account Selection Key Format

The HTML guide uses a composite key for account selection state:

```
{dataset}|{as_node_id}|{opaque_identifier}
```

**Examples:**
- `deposit|as1|alpha-dep-a1b2c3d4`
- `cardpayment|as2|beta-card-r5s6t7u8`

---

## Summary: Who Calls What

| Step | Party | API | Auth |
|---|---|---|---|
| 1 | IDP | `POST /v7/identity` | — |
| 1b | RP | `GET /v7/utility/idp/:ns/:id` | — |
| 2 | RP | `POST /v7/rp/requests/:ns/:id` | — |
| 2 | IDP | `POST /v7/idp/response` | accessor signature |
| 2 | AS | `POST /v7/yourdata/utility/token` | — |
| 2 | AS | `POST /v7/as/data/:request_id/:service_id` | — |
| 2 | RP | `GET /v7/rp/request_data/:id` | — |
| 3 | RP | `POST /v7/yourdata/rp/requests` | `as_token` |
| 3 | AS | `POST /v7/yourdata/utility/token` | — |
| 3 | AS | `POST /v7/yourdata/as/data` | — |
| 3 | RP | `GET /v7/yourdata/rp/request_data/:id` | — |
| 4 | RP | `POST /v7/yourdata/rp/requests` | `consent_token` |
| 4 | AS | `POST /v7/yourdata/as/data` | — |
| 4 | RP | `GET /v7/yourdata/rp/request_data/:id` | — |
| 4 | RP | `POST /v7/yourdata/rp/data_decryption_key_retry_requests` | — |
| 5 | RP | `POST /v7/rp/requests/:ns/:id` | — |
| 5 | IDP | `POST /v7/idp/response` | accessor signature |
| 5 | AS | `POST /v7/as/data/:request_id/:service_id` | — |
