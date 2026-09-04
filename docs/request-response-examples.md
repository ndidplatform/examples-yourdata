# Request/Response Examples — Pre-consent, Complete-consent, Data Request, Revoke

- `request_timeout` (seconds) is how long the platform waits for a response to the request itself before it expires unanswered
- `expiration_datetime` (unix seconds) is how long the resulting **token** stays valid for making data requests, once consent has actually been granted — it applies to the pre-consent token, and to the complete-consent/data-request token (see the examples below).

---

## 1) Pre-consent

**`request_params`** (the string value of a `data_request_list` item's `request_params`):

```json
{
  "token_objective": "เพื่อการพิจารณาให้สินเชื่อ",
  "usage_type": "continuous_with_expire",
  "data_service_list": [
    {
      "service_id": "900.deposit_transactions_basic_002",
      "expiration_datetime": 1791954000
    }
  ]
}
```

`expiration_datetime` here is optional and only meaningful when `usage_type` is
`continuous_with_expire` — it lets the RP request a specific expiry (unix
seconds) for the resulting consent token.

The lookback period (6 or 12 months) and permission level (Basic/Detail) for Transactions/Statement-type datasets are both encoded directly in the requested `service_id` — e.g. `900.deposit_transactions_basic_002` is Basic level with a 12-month lookback (`_001` suffix = 6 months, `_002` suffix = 12 months; see the API guide §3/§4). There's no separate `service_extension` value to set for this.

**Response**

`data` is a JSON-stringified string on the wire; it's shown expanded here for
readability.

```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.pre_consent_deposit_001",
    "data": {
      "sub_identity_list": [
        {
          "namespace": "account_id",
          "identifier": "alpha-dep-a1b2c3d4",
          "visible_identifier": "***-***-1234",
          "identifier_extension": "{\"accountSubType\":\"CURRENT\"}"
        },
        {
          "namespace": "account_id",
          "identifier": "alpha-dep-e5f6a7b8",
          "visible_identifier": "***-***-5678",
          "identifier_extension": "{\"accountSubType\":\"SAVINGS\"}"
        }
      ],
      "authorization": "<pre-consent as_token — decoded payload below>"
    }
  }
]
```

Decoded `authorization` payload (JWT middle segment, mock/unsigned):

```json
{
  "as_node_id": "as1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "source_request_id_list": ["<pre-consent request_id>"],
  "usage_type": "one_time",
  "expiration_datetime": 1784178900,
  "validate_identifier": true,
  "validate_service_id": true,
  "validate_service_extension": false,
  "token_objective": "เพื่อการพิจารณาให้สินเชื่อ",
  "service_id_list": [
    {
      "service_id": "900.complete_consent_001",
      "service_version": "v1",
      "service_extension": [
        "{\"usage_type\":\"continuous_with_expire\",\"data_service_list\":[{\"service_id\":\"900.deposit_transactions_basic_002\"}]}"
      ]
    }
  ]
}
```

`expiration_datetime` is a unix timestamp in **seconds** (not milliseconds),
fixed at 15 minutes from issuance — this pre-consent token is short-lived by
design, since it only needs to survive long enough to reach complete-consent.
Contrast with the complete-consent token below, whose expiration reflects the
actual granted usage window.

---

## 2) Complete-consent

**`request_params`** — a JSON-stringified array of the full selected account items,
echoed back exactly as received from pre-consent's `sub_identity_list`:

```json
[
  {
    "namespace": "account_id",
    "identifier": "alpha-dep-a1b2c3d4",
    "visible_identifier": "***-***-1234",
    "identifier_extension": "{\"accountSubType\":\"CURRENT\"}"
  },
  {
    "namespace": "account_id",
    "identifier": "alpha-dep-e5f6a7b8",
    "visible_identifier": "***-***-5678",
    "identifier_extension": "{\"accountSubType\":\"SAVINGS\"}"
  }
]
```

**`authorization`**

```
<the same pre-consent as_token from step 1>
```

**Response**

```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.complete_consent_001",
    "data": [
      "<consent_token for alpha-dep-a1b2c3d4>",
      "<consent_token for alpha-dep-e5f6a7b8>"
    ]
  }
]
```

Number of tokens issued depends on `usage_type`: for `one_time` with more than one
requested `service_id`, the AS issues one token per `service_id` × `selected_account` (each service gets its own token, per account); for
`recurring`, it issues one token per selected account, covering all requested
services together.

Decoded consent token for `alpha-dep-a1b2c3d4`:

```json
{
  "as_node_id": "as1",
  "namespace": "citizen_id",
  "identifier": "1234567890123",
  "source_request_id_list": [
    "<pre-consent request_id>",
    "<complete-consent request_id>"
  ],
  "usage_type": "continuous_with_expire",
  "expiration_datetime": 1791954000,
  "validate_identifier": true,
  "validate_service_id": true,
  "validate_service_extension": true,
  "service_id_list": [
    {
      "service_id": "900.deposit_transactions_basic_002",
      "service_version": "v1"
    }
  ],
  "sub_identity_list": [
    {
      "namespace": "account_id",
      "identifier": "123-456-1234",
      "visible_identifier": "123-456-1234",
      "identifier_extension": "{\"accountSubType\":\"CURRENT\"}"
    }
  ]
}
```

`expiration_datetime` is a unix timestamp in **seconds**. It defaults to 90 days
from issuance for `continuous_with_expire` tokens (1 day for `one_time`), unless
the RP requests an override via `expiration_datetime` on the corresponding
`data_service_list` item in the pre-consent `request_params` — that value is
also expected in seconds, used as-is with no conversion. Note `visible_identifier`
is the real (unmasked) account number here, not the masked value shown at
pre-consent — this is intentional: by complete-consent time, the account has
already been selected by the user and disclosed to the RP. This unmasking only
applies to deposit and loan accounts; card payment (and e-money) identifiers
stay uniqueId and masked in `identifier` and `visible_identifier` at complete-consent.


---

## 3) Data request (deposit transactions)

**`request_params`** (account 1, `alpha-dep-a1b2c3d4`):

```json
{
  "fromBookingDateTime": "2026-06-01T00:00:00+07:00",
  "toBookingDateTime": "2026-06-30T23:59:59+07:00",
  "language": "TH"
}
```

**`authorization`** (account 1) — the per-account consent token issued at
complete-consent:

```
<consent_token for alpha-dep-a1b2c3d4, issued at complete-consent>
```

**Response A**

```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.deposit_transactions_basic_002",
    "data": {
      "accountId": "123-456-1234",
      "statementEntries": [
        {
          "transactionId": "TXN-A-001",
          "bookingDateTime": "2026-06-01T00:00:00+07:00",
          "valueDateTime": "2026-06-01T00:00:00+07:00",
          "commonTransactionCode": {
            "domainCode": "PMNT",
            "familyCode": "RCDT",
            "subFamilyCode": "SALA"
          },
          "proprietaryBankTransactionCode": "TW",
          "proprietaryBankTransactionDescription": "Transfer in",
          "creditDebitIndicator": "CRDT",
          "amount": 5000,
          "amountCurrency": "THB"
        },
        {
          "transactionId": "TXN-A-002",
          "bookingDateTime": "2026-06-10T00:00:00+07:00",
          "valueDateTime": "2026-06-10T00:00:00+07:00",
          "commonTransactionCode": {
            "domainCode": "PMNT",
            "familyCode": "MDOP",
            "subFamilyCode": "RPMT"
          },
          "proprietaryBankTransactionCode": "BP",
          "proprietaryBankTransactionDescription": "Bill payment",
          "creditDebitIndicator": "DBIT",
          "amount": 1200,
          "amountCurrency": "THB"
        },
        {
          "transactionId": "TXN-A-003",
          "bookingDateTime": "2026-06-15T00:00:00+07:00",
          "valueDateTime": "2026-06-15T00:00:00+07:00",
          "commonTransactionCode": {
            "domainCode": "PMNT",
            "familyCode": "MDOP",
            "subFamilyCode": "FEES"
          },
          "proprietaryBankTransactionCode": "BP",
          "proprietaryBankTransactionDescription": "Bill payment",
          "creditDebitIndicator": "DBIT",
          "amount": 500,
          "amountCurrency": "THB"
        }
      ]
    }
  }
]
```

**`request_params`** (account 2, `alpha-dep-e5f6a7b8`):

```json
{
  "fromBookingDateTime": "2026-06-01T00:00:00+07:00",
  "toBookingDateTime": "2026-06-30T23:59:59+07:00",
  "language": "TH"
}
```

**`authorization`** (account 2) — same as account 1:

```
<consent_token for alpha-dep-e5f6a7b8, issued at complete-consent>
```

**Response B**

```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.deposit_transactions_basic_002",
    "data": {
      "accountId": "234-567-5678",
      "statementEntries": [
        {
          "transactionId": "TXN-B-001",
          "bookingDateTime": "2026-06-03T00:00:00+07:00",
          "valueDateTime": "2026-06-03T00:00:00+07:00",
          "commonTransactionCode": {
            "domainCode": "PMNT",
            "familyCode": "RCDT",
            "subFamilyCode": "DMCT"
          },
          "proprietaryBankTransactionCode": "TW",
          "proprietaryBankTransactionDescription": "Transfer in",
          "creditDebitIndicator": "CRDT",
          "amount": 20000,
          "amountCurrency": "THB"
        },
        {
          "transactionId": "TXN-B-002",
          "bookingDateTime": "2026-06-12T00:00:00+07:00",
          "valueDateTime": "2026-06-12T00:00:00+07:00",
          "commonTransactionCode": {
            "domainCode": "PMNT",
            "familyCode": "MDOP",
            "subFamilyCode": "RPMT"
          },
          "proprietaryBankTransactionCode": "LN",
          "proprietaryBankTransactionDescription": "Loan repayment",
          "creditDebitIndicator": "DBIT",
          "amount": 3500,
          "amountCurrency": "THB"
        }
      ]
    }
  }
]
```

---

## 4) Revoke

**`request_params`** (the string value of the `900.revoke_consent_001`
`data_request_list` item's `request_params` — a JSON-stringified array of
`token_id`s):

```json
[
  "a1e6c2d4-3f2b-4e8a-9c11-7d5b6e2f9a01",
  "b2f7d3e5-4a3c-4f9b-ad22-8e6c7f3a0b12"
]
```

**Response**

```json
[
  {
    "source_node_id": "as1",
    "service_id": "900.revoke_consent_001",
    "data": [
      "a1e6c2d4-3f2b-4e8a-9c11-7d5b6e2f9a01",
      "b2f7d3e5-4a3c-4f9b-ad22-8e6c7f3a0b12"
    ]
  }
]
```
