# YourData API — Developer Guide

NDID Platform · Centralized Data Exchange Mechanism · v1.1  
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
- **`identifier` unmasking is dataset-specific.** At pre-consent, `identifier` in `sub_identity_list` is always an AS-generated opaque ID. Whether it becomes the real, unmasked value at complete-consent depends on the dataset (see NDID's "Response Schema for pre_consent" reference):
  - **Deposit / Loan** — `identifier` changes to the real `account_id` at complete-consent.
  - **Card Payment** — `identifier` stays the same opaque/masked value even in the `consent_token`, never unmasked (PCI-DSS).
  - **e-Money** — `identifier` is already the AS's internal customer/wallet ID from pre-consent onward; there's no separate "unmasked" value to switch to.
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

> **AS registration for on-chain services** uses a different endpoint than the YourData one below — `POST /v7/as/service/{service_id}`, with body `{reference_id, callback_url, min_ial, min_aal, url, supported_namespace_list}` (`reference_id` and `callback_url` required). There's no `supported_authorization`/`service_availability` here — the on-chain flow doesn't have YourData's token/usage_type concept. Register each of the 5 service_ids above (`900.pre_consent_*`, `900.revoke_consent_001`) this way before they'll route to your AS node.

### Off-chain YourData Services (YourData API)

Used with `POST /v7/yourdata/rp/requests`

| Service ID | Description |
|-----------|-------------|
| `900.complete_consent_001` | Complete consent (token exchange) |
| `900.deposit_account_001` | Deposit — account info |
| `900.deposit_balance_001` | Deposit — balance |
| `900.deposit_transactions_001` | Deposit — transactions |
| `900.deposit_statement_001` | Deposit — statement |
| `900.emoney_account_001` | e-Money — account info |
| `900.emoney_balance_001` | e-Money — balance |
| `900.emoney_transactions_001` | e-Money — transactions |
| `900.emoney_statement_001` | e-Money — statement |
| `900.cardpayment_account_001` | Card Payment — account info |
| `900.cardpayment_outstandingbalance_001` | Card Payment — outstanding balance |
| `900.cardpayment_transactions_001` | Card Payment — transactions |
| `900.cardpayment_scheduledpayment_001` | Card Payment — scheduled payment |
| `900.cardpayment_statement_001` | Card Payment — statement |
| `900.loan_account_001` | Loan — account info |
| `900.loan_outstandingbalance_001` | Loan — outstanding balance |
| `900.loan_statement_001` | Loan — statement |

### AS Service Registration (One-time Setup)

Before any of the above works, **each AS must register every service_id it supports**:

```
POST /v7/yourdata/as/service/{service_id}
```
```json
{
  "service_url": "https://as1.example.com/yourdata/callback",
  "supported_namespace_list": ["account_id"],
  "supported_authorization": ["token_one_time", "token_continuous_with_expire"],
  "service_availability": true
}
```

> `supported_authorization` declares which token `usage_type`s this service_id accepts — the AS node validates incoming tokens against whatever was registered here. For YourData today, register whichever of **`token_one_time`** and **`token_continuous_with_expire`** your bank actually supports for that service.
>
> **Register `900.complete_consent_001` with at least `token_one_time`** — even if your bank only supports `continuous_with_expire` consent overall. Complete-consent and request-data share the same underlying validation mechanism, and the pre-consent → complete-consent exchange always uses a `one_time` as_token (§6) regardless of what usage_type the eventual consent_token will have. Forgetting this means valid complete-consent calls get rejected.
>
> \* The full enum also includes `no_token_needed` and `token_continuous_no_expire` — the latter is reserved for future use (project CONNEXT) and has no YourData use case today.
> Register each dataset service_id (`900.deposit_transactions_001`, etc.) with whichever usage_types your bank actually supports for that data.

---

## 4. Dataset APIs & Permissions

Each off-chain data API accepts a `service_extension` array to control the level of detail returned, **where the underlying dataset schema actually defines a Basic/Detail split**. This is verified against the real `YourData_Schema_*` OpenAPI specs (SwaggerHub, `NDID/YourData_Schema_{Deposit,EMoney,CardPayment,Loan}` v0.5.0) — **only Transactions (all datasets) and Statements (Deposit/e-Money only) have a Basic/Detail `oneOf` response.** Accounts, Balances, Scheduled Payment, and Card Payment/Loan Statements each have exactly **one** response shape — there is no Basic/Detail split to request, so `service_extension` is omitted for those.

Request query params also differ per dataset — see each dataset's endpoint request body/query shape below (not a single universal `fromXDate`/`toXDate` pair).

> **Proposed extensions (not yet in the published schema):**
> - `lookback_6_months` / `lookback_12_months` — for Transactions (all datasets) and Statements, letting the RP request how far back the AS should look.
> - `accounts_basic` / `accounts_detail` — for Accounts, all datasets (the real schema currently has only one Accounts response shape).
> - `balances` — for Balances (Deposit, e-Money).
> - `outstanding_balances` — for Outstanding Balance (Card Payment, Loan).
>
> All of these are forward-looking options pending schema publication, and can be combined with each other in the same `service_extension` array (e.g. `["accounts_detail"]`, or `["transactions_basic", "lookback_12_months"]`).

### Deposit

Request query: `language` (all); `fromBookingDateTime`/`toBookingDateTime` (Transactions, Statements — date-time, fixed `00:00:00+07:00`/`23:59:59+07:00`).

| API Endpoint | Service ID | Permission | `service_extension` value |
|---|---|---|---|
| Accounts | `900.deposit_account_001` | Accounts Basic | `accounts_basic` |
| | | Accounts Detail | `accounts_detail` |
| Balances | `900.deposit_balance_001` | Balances | `balances` |
| Transactions | `900.deposit_transactions_001` | Transactions Basic | `transactions_basic` |
| | | Transactions Detail | `transactions_detail` |
| Statements | `900.deposit_statement_001` | Statements Basic | `statements_basic` |
| | | Statements Detail | `statements_detail` |

### Card Payment

Request query: `language` (all); `toTransactionDate` (Outstanding Balance — single date); `fromTransactionDate`/`toTransactionDate` (Transactions — date, not date-time); `statementDate` (Scheduled Payment, Statements — single date, not a range).

| API Endpoint | Service ID | Permission | `service_extension` value |
|---|---|---|---|
| Accounts | `900.cardpayment_account_001` | Accounts Basic | `accounts_basic` |
| | | Accounts Detail | `accounts_detail` |
| Outstanding Balance | `900.cardpayment_outstandingbalance_001` | Outstanding Balance | `outstanding_balances` |
| Transactions | `900.cardpayment_transactions_001` | Transactions Basic | `transactions_basic` |
| | | Transactions Detail | `transactions_detail` |
| Scheduled Payment | `900.cardpayment_scheduledpayment_001` | Scheduled Payment | *(none)* |
| Statements | `900.cardpayment_statement_001` | Statements | *(none — single response shape, no Basic/Detail split)* |

### Loan

Request query: `language` (Accounts, Outstanding Balance); `billDate` + `language` (Statements — single date). **No Transactions endpoint exists for Loan.**

| API Endpoint | Service ID | Permission | `service_extension` value |
|---|---|---|---|
| Accounts | `900.loan_account_001` | Accounts Basic | `accounts_basic` |
| | | Accounts Detail | `accounts_detail` |
| Outstanding Balance | `900.loan_outstandingbalance_001` | Outstanding Balance | `outstanding_balances` |
| Statements | `900.loan_statement_001` | Statements | *(none — single response shape, no Basic/Detail split)* |

### e-Money

Request query: `language` (all); `fromBookingDateTime`/`toBookingDateTime` (Transactions, Statements).

| API Endpoint | Service ID | Permission | `service_extension` value |
|---|---|---|---|
| Accounts | `900.emoney_account_001` | Accounts Basic | `accounts_basic` |
| | | Accounts Detail | `accounts_detail` |
| Balances | `900.emoney_balance_001` | Balances | `balances` |
| Transactions | `900.emoney_transactions_001` | Transactions Basic | `transactions_basic` |
| | | Transactions Detail | `transactions_detail` |
| Statements | `900.emoney_statement_001` | Statements Basic | `statements_basic` |
| | | Statements Detail | `statements_detail` |

---

## 5. Error Codes

All codes are type `as`. Registered in the YourData domain via `GetDomainErrorCodeList`.

| Code | Description | Source |
|------|-------------|--------|
| `40000` | Unknown Error | AS application |
| `40100` | No Data | AS application |
| `40400` | Invalid data / params (e.g. empty account selection, bad date range) | AS application |
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
| `service_id_list` | Always exactly 1 entry: `{service_id: "900.complete_consent_001", service_extension: [<embedded intent JSON>]}` | The actual dataset `service_id`(s) requested — 1 entry for `one_time`, all selected services for `continuous_*` |
| `validate_identifier` / `validate_service_id` | `true` / `true` | `true` / `true` |
| `validate_service_extension` | `false` (the real intent is embedded, not matched literally) | `true` |
| `usage_type` | Always `"one_time"` — the as_token itself is a short-lived exchange token, regardless of what usage_type the RP ultimately wants for the consent_token | The RP-declared usage_type (`one_time` / `continuous_with_expire` / `continuous_no_expire`), reconstructed from the embedded intent |
| `expiration_datetime` | Short-lived (e.g. ~15 min) — required since usage_type is `one_time` | Per the usage_type rule above (required except `continuous_no_expire`) |
| **`source_request_id_list`** | `["req-pre-xxxx"]` — just the pre-consent request_id | `["req-pre-xxxx", "req-cc-{dataset}-{as}"]` — **both** the original pre-consent request_id **and** this complete-consent request_id, forming a full audit trail from initial consent through to token issuance |
| **Tokens created per call** | Always **1** — one as_token per pre-consent callback (i.e. per dataset × AS), regardless of usage_type | Per the table above — 1 per (account × service_id) for `one_time`, 1 per account for `continuous_*` |

> **What `validate_identifier` / `validate_service_id` / `validate_service_extension` actually do:** these flags travel inside the signed token and are enforced **automatically by NDID's platform software on the AS's node**, before your application's callback is ever invoked (see §10.2's "what the platform already validated").
> - `validate_identifier: true` → platform confirms the `namespace`/`identifier` (or `sub_identity_list` account) on the incoming request matches the token's.
> - `validate_service_id: true` → platform confirms the requested `service_id` matches one the token was scoped to.
> - `validate_service_extension: true` → platform also confirms `service_extension` (e.g. `accounts_basic` vs `accounts_detail`) matches.
>
> Setting a flag `false` tells the platform it does **not** need to enforce that particular match — used for `as_token`'s `validate_service_extension` above because the real requested extension is embedded in the intent JSON, not meant to be literally compared. A mismatch on any `true` flag rejects the request before your callback URL is even called.

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
  "mode": 3,
  "accessor_type": "RSA",
  "accessor_public_key": "<RSA PEM public key>",
  "accessor_id": "acc-xxxx",
  "ial": 2.3
}
```

> `identity_list` (min 1 item) lets one call link multiple `(namespace, identifier)` pairs to the same identity. `mode` only accepts `2` or `3` for this endpoint. `accessor_id` is optional — omit it to let the system auto-generate one.

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

### 7.2 RP: Get IDP List (for IDP picker UI)

```
GET /v7/utility/idp/citizen_id/{identifier}?min_ial=2.3&min_aal=2.2&mode=3
```

**Response:**
```json
[
  { "node_id": "idp1", "node_name": "Alpha Bank IDP", "ial": 2.3, "mode_list": [2, 3], "max_ial": 2.3, "max_aal": 3 },
  { "node_id": "idp2", "node_name": "Beta Bank IDP",  "ial": 2.3, "mode_list": [3],   "max_ial": 2.3, "max_aal": 3 }
]
```

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
  "mode": 3,
  "reference_id": "pre-consent-1750000000000",
  "idp_id_list": ["idp1"],
  "callback_url": "http://rp-cb:6001/rp/request/pre-consent-xxx",
  "bypass_identity_check": false,
  "data_request_list": [
    {
      "service_id": "900.pre_consent_deposit_001",
      "as_id_list": ["as1", "as2"],
      "min_as": 0,
      "request_params": "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_001\",\"service_version\":\"v1\",\"service_extension\":[\"transactions_basic\"]}]}"
    },
    {
      "service_id": "900.pre_consent_cardpayment_001",
      "as_id_list": ["as1"],
      "min_as": 0,
      "request_params": "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.cardpayment_transactions_001\",\"service_version\":\"v1\",\"service_extension\":[\"transactions_basic\"]}]}"
    }
  ],
  "request_message": "Please consent to share your data (REF: pre-consent-xxx)",
  "min_ial": 2.3,
  "min_aal": 2.2,
  "min_idp": 1,
  "request_timeout": 600
}
```

> `namespace`/`identifier` are **URL path params** (`/v7/rp/requests/citizen_id/{identifier}`), not body fields. `bypass_identity_check` is required when `mode` is `2` or `3` — `false` means the platform verifies each IdP in `idp_id_list` actually has this identity onboarded at the required IAL before routing to it.  
> **`request_params`** is a JSON-stringified object containing `usage_type` and `data_service_list`. The AS reads this to know what kind of token to issue and what services to scope it to.

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
  "mode": 3,
  "request_id": "req-pre-xxxx",
  "reference_group_code": "rg-xxxx",
  "request_message": "Please consent to share your data (REF: pre-consent-xxx)",
  "request_message_hash": "<sha256-hash>",
  "request_message_salt": "<salt>",
  "requester_node_id": "rp1",
  "min_ial": 2.3,
  "min_aal": 2.2,
  "data_request_list": [
    { "service_id": "900.pre_consent_deposit_001", "as_id_list": ["as1", "as2"], "min_as": 0 }
  ],
  "initial_salt": "<salt>",
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
  "aal": 2.2,
  "status": "accept",
  "accessor_id": "acc-xxxx",
  "signature": "<base64-rsa-sig>"
}
```

> `reference_id`/`callback_url` here are the **IDP's own** async-result tracking (not the RP's) — required whenever `status` isn't rejected outright. `namespace`/`identifier` are not part of this endpoint's body at all.

### 8.4 AS: Pre-consent Callback (one per dataset × AS)

Callback → `POST /as/service/{service_id}` — example for `900.pre_consent_deposit_001` → `as1`:
```json
{
  "node_id": "as1",
  "type": "data_request",
  "request_id": "req-pre-xxxx",
  "mode": 3,
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "service_id": "900.pre_consent_deposit_001",
  "requester_node_id": "rp1",
  "request_params": "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_001\",\"service_version\":\"v1\",\"service_extension\":[\"transactions_basic\"]}]}",
  "response_signature_list": ["<base64-signature>"],
  "max_ial": 2.3,
  "max_aal": 2.2,
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
        "{\"usage_type\":\"one_time\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_001\",\"service_version\":\"v1\",\"service_extension\":[\"transactions_basic\"]}]}"
      ]
    }
  ]
}
```

> The `service_extension[0]` on `complete_consent_001` carries the original intent (usage_type + data_service_list) so the AS can reconstruct it during complete-consent without the RP re-sending it.

### 8.6 AS: Respond to NDID with Masked Accounts + as_token

```
POST /v7/as/data/req-pre-xxxx/900.pre_consent_deposit_001
```

> `request_id` and `service_id` are **URL path params**, not body fields.

```json
{
  "reference_id": "ndid-data-deposit-as1",
  "callback_url": "http://as-cb:6002/as/response",
  "data": "{\"sub_identity_list\":[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"***-***-1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\"}\"}],\"authorization\":\"<as_token JWT>\"}"
}
```

### 8.7 RP: Status Callback (completed)

Callback → `POST /rp/request/{reference_id}`:
```json
{
  "node_id": "rp1",
  "type": "request_status",
  "request_id": "req-pre-xxxx",
  "requester_node_id": "rp1",
  "mode": 3,
  "request_message_hash": "<sha256-hash>",
  "min_ial": 2.3,
  "min_aal": 2.2,
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
  "request_timeout": 600,
  "status": "completed",
  "closed": true,
  "timed_out": false,
  "block_height": "12345:5"
}
```

> The top-level `response_list` is about **IDP** responses (`idp_id`, `valid_signature`, `valid_ial`); the `response_list` nested inside each `data_request_list` entry is about **AS** responses per service (`as_id`, `signed`, `received_data`) — two different things at different nesting levels.

### 8.8 RP: Retrieve Masked Account Lists

```
GET /v7/rp/request_data/req-pre-xxxx
```

**Response** (one entry per dataset × AS — `authorization` field stripped by RP before returning to client):
```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.pre_consent_deposit_001",
    "data": "{\"sub_identity_list\":[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"***-***-1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\"}\"}]}"
  },
  {
    "source_node_id": "as2",
    "service_id": "900.pre_consent_deposit_001",
    "data": "{\"sub_identity_list\":[{\"namespace\":\"account_id\",\"identifier\":\"beta-dep-c9d0e1f2\",\"visible_identifier\":\"***-***-9001\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\"}\"}]}"
  }
]
```

> **RP stores** `as_token` server-side keyed by `(request_id, dataset, as_node_id)`. The `authorization` field is **never forwarded** to the client.

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
  "request_params": "[{\"namespace\":\"account_id\",\"identifier\":\"alpha-dep-a1b2c3d4\",\"visible_identifier\":\"***-***-1234\",\"identifier_extension\":\"{\\\"accountSubType\\\":\\\"CURRENT\\\"}\"}]",
  "authorization": "<as_token for (Deposit x as1)>",
  "request_timeout": 900
}
```

> `request_params` = JSON-stringified array of **selected account objects** (exact objects from pre-consent `sub_identity_list`). Empty array `[]` = consent to all accounts.

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
  "expiration_datetime": 1750087300,
  "validate_identifier": true,
  "validate_service_id": true,
  "validate_service_extension": true,
  "service_id_list": [
    { "service_id": "900.deposit_transactions_001", "service_version": "v1", "service_extension": ["transactions_basic"] }
  ],
  "sub_identity_list": [
    {
      "namespace": "account_id",
      "identifier": "123-456-1234",
      "visible_identifier": "***-***-1234",
      "identifier_extension": "{\"accountSubType\":\"CURRENT\"}"
    }
  ]
}
```

> `identifier` in `sub_identity_list` is the **real account number** — not the opaque pre-consent identifier. This unmasking only applies to **Deposit and Loan**; Card Payment keeps the same opaque/masked value (PCI-DSS), and e-Money's identifier was already the AS's internal ID from pre-consent onward (see Key Design Principles above).  
> `source_request_id_list` must include **both** the pre-consent request_id and this complete-consent request_id.  
> `expiration_datetime` is **required for every `usage_type` except `continuous_no_expire`** — token creation fails with `TOKEN_MUST_HAVE_EXPIRATION_TIME` otherwise. Give `one_time` tokens a reasonable window (here: ~24h) to actually be redeemed via Step 4, not just a few minutes.

Token create body (token 1, `continuous_with_expire`, all services):
```json
{
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "source_request_id_list": ["req-pre-xxxx", "req-cc-deposit-as1"],
  "usage_type": "continuous_with_expire",
  "expiration_datetime": 1757808000,
  "service_id_list": [
    { "service_id": "900.deposit_transactions_001", "service_version": "v1", "service_extension": ["transactions_basic"] },
    { "service_id": "900.deposit_balance_001", "service_version": "v1" }
  ],
  "sub_identity_list": [
    { "namespace": "account_id", "identifier": "123-456-1234", "visible_identifier": "***-***-1234", "identifier_extension": "{\"accountSubType\":\"CURRENT\"}" }
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

**RP retrieves and decodes tokens:**
```
GET /v7/yourdata/rp/request_data/req-cc-deposit-as1
```

**Response** (RP decodes each JWT, maps `visible_identifier` → opaque accountId, stores token server-side):
```json
{
  "source_node_id": "as1",
  "service_id": "900.complete_consent_001",
  "data": "[\"alpha-dep-a1b2c3d4\"]"
}
```

> Client receives only the opaque `accountId` array. Raw `consent_token` JWTs are stored server-side keyed by `(accountId, service_id)`.  
> Each decoded JWT payload includes a **`token_id`** (a UUID the AS generated when it created the token via `POST /v7/yourdata/utility/token`). The RP extracts and stores this `token_id` alongside `as_node_id` — both are required later to revoke the token (see [Step 5](#11-step-5--revoke-consent-on-chain)); the raw JWT itself is never resent.

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
  "service_id": "900.deposit_transactions_001",
  "service_version": "v1",
  "as_node_id": "as1",
  "reference_id": "data-request-1750000000002",
  "callback_url": "http://rp-cb:6001/yourdata/rp/request_status_update",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "request_params": "{\"fromBookingDateTime\":\"2026-01-01T00:00:00+07:00\",\"toBookingDateTime\":\"2026-03-31T23:59:59+07:00\",\"language\":\"TH\"}",
  "authorization": "<consent_token>",
  "request_timeout": 900,
  "service_extension": ["transactions_basic"]
}
```

> `authorization` = consent_token resolved by RP from `(accountId, service_id)`. Never sent by the client.  
> `service_extension` = permission level: `transactions_basic` or `transactions_detail` etc.

### 10.2 AS: Data Request Callback

Callback → `POST /yourdata/as/request/{service_id}`:
```json
{
  "node_id": "as1",
  "type": "yourdata.data_request",
  "request_id": "req-data-xxxx",
  "service_id": "900.deposit_transactions_001",
  "service_version": "v1",
  "service_extension": ["transactions_basic"],
  "requester_node_id": "rp1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "request_params": "{\"fromBookingDateTime\":\"2026-01-01T00:00:00+07:00\",\"toBookingDateTime\":\"2026-03-31T23:59:59+07:00\",\"language\":\"TH\"}",
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
3. maxLookbackDays = lookback_12_months in service_extension ? 365
                   : lookback_6_months in service_extension  ? 180
                   : <TBD -- default range when no lookback_* extension is present>
   (toDate - fromDate) > maxLookbackDays      → error 40710 (Date Range Exceeds Permission)
4. tokenAccountMap.get(authorization)        → get account details
5. Build response matching dataset schema
6. responseSize > platform's size limit       → error 40780 (AS Data Size Larger Than Limit)
```

> The permitted date range comes from the `lookback_6_months`/`lookback_12_months` `service_extension` value embedded in the consent_token's `service_id_list` (§4) — not a fixed constant. The default range when no lookback extension is present is **still TBD**, pending more data.

### 10.4 AS: Send Data

```
POST /v7/yourdata/as/data
```

Example response body for `deposit_transactions_001` with `transactions_basic`:
```json
{
  "request_id": "req-data-xxxx",
  "data": "{\"accountId\":\"123-456-1234\",\"statementEntries\":[{\"transactionId\":\"TXN-A-001\",\"bookingDateTime\":\"2026-06-01T00:00:00+07:00\",\"commonTransactionCode\":{\"domainCode\":\"PMNT\",\"familyCode\":\"RCDT\",\"subFamilyCode\":\"SALA\"},\"proprietaryBankTransactionCode\":\"TW\",\"proprietaryBankTransactionDescription\":\"Transfer in\",\"creditDebitIndicator\":\"CRDT\",\"amount\":5000,\"amountCurrency\":\"THB\"}]}"
}
```

With `transactions_detail` the response additionally includes `transactionInformation`, `creditorAccountName`, `debtorAccountName`.

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
  "type": "yourdata.request_status",
  "requester_node_id": "rp1",
  "as_node_id": "as1",
  "request_id": "req-data-xxxx",
  "request_timeout": 900,
  "status": "completed",
  "timed_out": false
}
```

RP retrieves the data the same way as before:

```
GET /v7/yourdata/rp/request_data/req-data-xxxx
```
```json
{
  "source_node_id": "as1",
  "service_id": "900.deposit_transactions_001",
  "data": "{\"accountId\":\"123-456-1234\",\"statementEntries\":[{\"transactionId\":\"TXN-A-001\",\"bookingDateTime\":\"2026-06-01T00:00:00+07:00\",\"domainCode\":\"PMNT\",\"familyCode\":\"RCDT\",\"subFamilyCode\":\"SALA\",\"proprietaryBankTransactionCode\":\"TW\",\"proprietaryBankTransactionDescription\":\"Transfer in\",\"creditDebitIndicator\":\"CRDT\",\"amount\":5000,\"amountCurrency\":\"THB\"}]}"
}
```

### 10.7 Data Response Examples by Service

> Field names below are taken directly from the real `YourData_Schema_*` OpenAPI specs (SwaggerHub `NDID/YourData_Schema_{Deposit,EMoney,CardPayment,Loan}` v0.5.0), not invented mocks. Endpoints without a Basic/Detail split (Accounts everywhere; Statements for Card Payment/Loan) have exactly one response shape.

#### Deposit — Account *(single response — no Basic/Detail)*
```json
{
  "institutionName": "ABCB",
  "accountId": "123-456-1234",
  "ownerType": "INDIVIDUAL",
  "accountType": "DEPOSIT",
  "accountSubType": "SAVINGS",
  "accountStatus": "ACTIVE",
  "accountName": "Mr. Somchai Jaidee",
  "accountOwner": "SINGLE",
  "openingDate": "2020-01-01T00:00:00+07:00"
}
```

#### Deposit — Balance
```json
{
  "accountId": "123-456-1234",
  "lastLedgerBalanceAmount": 85000.50,
  "lastLedgerBalanceCurrency": "THB",
  "lastAvailableBalanceAmount": 85000.50,
  "lastAvailableBalanceCurrency": "THB",
  "creditLimit": 50000
}
```

#### Deposit — Transactions (Basic)
```json
{
  "accountId": "123-456-1234",
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
      "amountCurrency": "THB"
    }
  ]
}
```

#### Deposit — Transactions (Detail) — each entry additionally includes:
```json
{ "transactionRef": "REF-0001", "transactionInformation": "Salary payment", "debtorAccountId": "111-222-3333", "debtorAccountName": "ABC COMPANY LTD" }
```

#### Deposit — Statements (Basic) *(`StatementHeader` fields + entries)*
```json
{
  "creationDateTime": "2026-07-01T00:00:00+07:00",
  "statementId": "STMT-2026-06",
  "institutionName": "ABCB",
  "accountId": "123-456-1234",
  "ownerType": "INDIVIDUAL",
  "accountType": "DEPOSIT",
  "accountSubType": "SAVINGS",
  "accountStatus": "ACTIVE",
  "accountName": "Mr. Somchai Jaidee",
  "accountOwner": "SINGLE",
  "openingDate": "2020-01-01T00:00:00+07:00",
  "lastLedgerBalanceAmount": 85000.50,
  "lastLedgerBalanceCurrency": "THB",
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
      "originDescription": "Branch teller"
    }
  ]
}
```

#### Deposit — Statements (Detail) — each entry additionally includes the same fields as Transactions (Detail).

#### Card Payment — Account *(single response — no Basic/Detail)*
```json
{
  "cardNumber": "****-****-****-1111",
  "cardName": "Mr. Somchai Jaidee",
  "cardType": "CREDIT",
  "issuerName": "ABCB",
  "cardBrand": "VISA",
  "productName": "ABCB Platinum",
  "ownerType": "INDIVIDUAL",
  "cardStatus": "ACTIVE",
  "isPrimary": true
}
```

#### Card Payment — Outstanding Balance
```json
{
  "cardNumber": "****-****-****-1111",
  "cardInfo": [
    {
      "creditLimitAmount": 100000,
      "creditLimitCurrency": "THB",
      "availableCreditAmount": 87500,
      "availableCreditCurrency": "THB",
      "outstandingBalanceAmount": 12500,
      "outstandingBalanceCurrency": "THB"
    }
  ]
}
```

#### Card Payment — Transactions (Basic)
```json
{
  "cardNumber": "****-****-****-1111",
  "usageTransactions": [
    {
      "transactionId": "CC-001",
      "transactionDate": "2026-05-03",
      "creditDebitIndicator": "DBIT",
      "amount": 3500,
      "amountCurrency": "THB",
      "transactionType": "SPENDING",
      "marchantCategoryCode": "5311"
    }
  ]
}
```

#### Card Payment — Transactions (Detail) — each entry additionally includes:
```json
{ "transactionDescription": "CENTRAL WORLD" }
```

#### Card Payment — Scheduled Payment *(single response — no Basic/Detail)*
```json
{
  "cardNumber": "****-****-****-1111",
  "cardInfo": [{ "creditLimitAmount": 100000, "creditLimitCurrency": "THB", "outstandingBalanceAmount": 12500, "outstandingBalanceCurrency": "THB" }],
  "statementDate": "2026-06-05",
  "statementDueDate": "2026-07-05"
}
```

#### Card Payment — Statements *(single response — no Basic/Detail)*
```json
{
  "cardNumber": "****-****-****-1111",
  "cardName": "Mr. Somchai Jaidee",
  "cardType": "CREDIT",
  "issuerName": "ABCB",
  "cardBrand": "VISA",
  "productName": "ABCB Platinum",
  "ownerType": "INDIVIDUAL",
  "cardInfo": [{ "creditLimitAmount": 100000, "creditLimitCurrency": "THB", "outstandingBalanceAmount": 12500, "outstandingBalanceCurrency": "THB" }],
  "statementDate": "2026-06-05",
  "statementDueDate": "2026-07-05",
  "cardStatus": "ACTIVE",
  "isPrimary": true,
  "paymentTransactions": [
    { "transactionDate": "2026-05-03", "creditDebitIndicator": "DBIT", "amount": 3500, "amountCurrency": "THB", "transactionType": "SPENDING", "transactionDescription": "CENTRAL WORLD", "marchantCategoryCode": "5311" }
  ]
}
```

#### Loan — Account *(single response — no Basic/Detail; no Transactions endpoint exists for Loan)*
```json
{
  "accountId": "***-***-9900",
  "accountName": "Mr. Somchai Jaidee",
  "institutionCode": "0004",
  "institutionName": "ABCB",
  "loanTypeCode": "2003200002",
  "securedLoanFlag": 0,
  "revolvingFlag": 0,
  "accountStatusCode": "2001600001",
  "openingDate": "2024-01-01T00:00:00+07:00",
  "maturityDate": "2027-01-01T00:00:00+07:00",
  "contractAmount": 100000,
  "contractAmountCurrency": "THB",
  "totalNumberOfInstallment": 36,
  "installmentAmount": 3200
}
```

#### Loan — Outstanding Balance
```json
{
  "accountId": "***-***-9900",
  "contractRemainingAmount": 72000,
  "contractRemainingCurrency": "THB",
  "outstandingBalanceAmount": 72000,
  "outstandingBalanceCurrency": "THB",
  "paidInstallment": 9,
  "dueInstallment": 10,
  "pastDueInstallment": 0
}
```

#### Loan — Statements *(single response — no Basic/Detail)*
```json
{
  "accountId": "***-***-9900",
  "accountName": "Mr. Somchai Jaidee",
  "institutionCode": "0004",
  "institutionName": "ABCB",
  "loanTypeCode": "2003200002",
  "securedLoanFlag": 0,
  "revolvingFlag": 0,
  "accountStatusCode": "2001600001",
  "openingDate": "2024-01-01T00:00:00+07:00",
  "maturityDate": "2027-01-01T00:00:00+07:00",
  "contractAmount": 100000,
  "contractAmountCurrency": "THB",
  "totalNumberOfInstallment": 36,
  "installmentAmount": 3200,
  "lastPaymentDate": "2026-06-01T00:00:00+07:00",
  "userDeclaredIncome": 50000,
  "accountStatementTransactions": [
    {
      "billDate": "2026-06-01T00:00:00+07:00",
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
      "interestAmount": 390
    }
  ]
}
```

#### e-Money — Account *(single response — no Basic/Detail)*
```json
{
  "institutionName": "ABCB",
  "eWalletId": "***-***-0010",
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
  "eWalletId": "***-***-0010",
  "lastLedgerBalanceAmount": 1500,
  "lastLedgerBalanceCurrency": "THB"
}
```

#### e-Money — Transactions (Basic)
```json
{
  "accountId": "***-***-0010",
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

#### e-Money — Statements (Basic) — same shape as Deposit Statements (Basic), with `eWalletId`/`nickName` instead of `accountId`/`accountType`.

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
  "mode": 3,
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
  "min_aal": 2.2,
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
  "mode": 3,
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "service_id": "900.revoke_consent_001",
  "requester_node_id": "rp1",
  "request_params": "[\"9fcf9cbc-a8a0-4edf-a818-8ba8e86cf60f\",\"<token_id_2>\"]",
  "response_signature_list": ["<base64-signature>"],
  "max_ial": 2.3,
  "max_aal": 2.2,
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
  "mode": 3,
  "request_message_hash": "<sha256-hash>",
  "min_ial": 2.3,
  "min_aal": 2.2,
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

#### Deposit — as1 (Alpha Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `alpha-dep-a1b2c3d4` | `***-***-1234` | `123-456-1234` | CurrentAccount |
| `alpha-dep-e5f6a7b8` | `***-***-5678` | `234-567-5678` | Savings |

#### Deposit — as2 (Beta Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `beta-dep-c9d0e1f2` | `***-***-9001` | `345-678-9001` | CurrentAccount |

#### Card Payment — as1 (Alpha Bank)

`identifier` is **never unmasked** (PCI-DSS) — the same opaque value is used at complete-consent too.

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `alpha-card-x1y2z3w4` | `4111-11XX-XXXX-1111` | `alpha-card-x1y2z3w4` (unchanged) | VISA |
| `alpha-card-m5n6p7q8` | `5500-00XX-XXXX-2222` | `alpha-card-m5n6p7q8` (unchanged) | Mastercard |

#### Card Payment — as2 (Beta Bank)

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `beta-card-r5s6t7u8` | `4111-22XX-XXXX-3333` | `beta-card-r5s6t7u8` (unchanged) | VISA |

#### Loan — as1 (Alpha Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `alpha-loan-l1m2n3o4` | `***-***-9900` | `***-***-9900` | PersonalLoan |

#### Loan — as2 (Beta Bank)

| Opaque Identifier | Masked | Real | Type |
|---|---|---|---|
| `beta-loan-p5q6r7s8` | `***-***-9901` | `***-***-9901` | PersonalLoan |

#### e-Money — as1 (Alpha Bank)

Namespace is **`e_wallet_id`** (not `account_id`). `identifier` is already the AS's internal customer/wallet ID from pre-consent onward — there's no separate unmasked value at complete-consent.

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `alpha-em-p1q2r3s4` | `081-234XXXX` | `alpha-em-p1q2r3s4` (unchanged) | Prepaid |

#### e-Money — as2 (Beta Bank)

| Opaque Identifier | Masked (`visible_identifier`) | At Complete-Consent | Type |
|---|---|---|---|
| `beta-em-u9v0w1x2` | `089-567XXXX` | `beta-em-u9v0w1x2` (unchanged) | Prepaid |

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
