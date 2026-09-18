# Changelog — YourData API Guide

Covers `yourdata-api-guide.html` and `yourdata-api-guide.md`, which are kept in lockstep and share one version number (shown in the page header / doc subtitle).

Compiled by diffing the four version snapshots in `~/Downloads` (`yourdata-api-guide-v1.1.html` through `-v1.4.html`) plus this session's own edits. No copy of v1.0 or earlier was available locally, so nothing before v1.1 is documented here. Release dates aren't included — the only date signal available (file mtimes) reflects when each copy was last saved/downloaded, not necessarily when the version was authored, so it isn't reliable enough to state as fact.

## v1.4.1

Fixes field-name regressions introduced in v1.4 that didn't actually match the real SwaggerHub `NDID/YourData_Schema_{Deposit,EMoney,CardPayment,Loan}` v1.0.1 specs — caught by re-verifying directly against the live schemas:

- **Deposit & e-Money — Transactions/Statement**: removed the fictitious `commonTransactionCode` wrapper object. `domainCode`/`familyCode`/`subFamilyCode` are flat top-level fields in the real `TransactionBase` schema, not nested.
- **Deposit — Transactions response**: array key corrected from `statementEntries` to `transactionEntries` (the Statement response correctly keeps `statementEntries`; the two were conflated).
- **Loan — Statement response**: array key corrected from `accountStatementTransactions` to `statementEntries`, matching the real `AccountStatementResponse` schema and the same naming convention used by Deposit/e-Money.
- Confirmed (no change needed): Card Payment and Loan account/balance/`creditInfo`/statement examples already matched the real v1.0.1 schemas, including the Basic-vs-Detail required-field deltas. `duePayemntDate` in the Loan statement entry is a genuine typo in the published spec (confirmed directly against the schema) and was intentionally left as-is rather than "corrected."

## v1.4

- Added a JWT size-estimate widget: shows the demo token's actual byte count (HMAC-SHA256) alongside a realistic estimate for a real RSA-2048-signed node token.
- Refactored `expiration_datetime` for `continuous_with_expire`: moved from a field attached to each `data_service_list` entry to a single shared field on the intent object (new `intentExpirationField()` helper) — matches how the real schema models it.
- Added dataset-specific pre-consent `request_params` via a new `preConsentExtraParams()` helper: `accountSubType` for Deposit, `loanTypeCode` for Loan; Card Payment/e-Money get neither. Added `auxiliaryReferenceId` to pre-consent params generally, and `request_type` propagated through to more example payloads.
- Added `identifier_extension` to pre-consent account items, per `YourData_Schema_Common` v1.0.1's `YourDataAccountItem_*` definitions:
  - Card Payment: `issuerName`, `cardStatus`, `isPrimary`, `cardType`
  - Loan: `accountName`, `institutionCode`, `institutionName`, `loanTypeCode`, `loanTypePersonalRegCode`
  - e-Money: `institutionName`, `accountStatus`, `accountName`
- Clarified that Deposit/Loan unmask **both** `identifier` and `visible_identifier` at complete-consent (previously the guide only showed `identifier` becoming unmasked).
- Changed masked/example identifier formatting to drop dashes (e.g. `XXX-XXX-1234` → `XXXXXX1234`, `XXXX-XXXX-XXXX-1111` → `411111XXXXXX1111`); e-Money identifiers switched from readable strings (`alpha-em-p1q2r3s4`) to opaque hex-like IDs.
- Card Payment: renamed `cardInfo` → `creditInfo`, `paymentTransactions` → `statementEntries`, `usageTransactions` → `transactionEntries`; fixed a `marchantCategoryCode` typo to `merchantCategoryCode`; added `postingDate`, `installmentTerm`, and `auxiliaryReferenceId`; simplified `statementDate` from a full date to year-month (`2026-06`).
- Loan: corrected `institutionCode` to the full 13-character code; simplified date fields (`openingDate`, `maturityDate`, `billDate`, `lastPaymentDate`) from datetime to date/month-only; added `duePayemntDate` (carried over from a genuine typo in the published spec) and `dueInstallment` to statement entries.
- e-Money: wrapped `lastLedgerBalanceAmount`/`lastLedgerBalanceCurrency` in a `balanceInfo` array on Balance/Statement responses (previously flat top-level fields) — this part was correct per the real spec.
- **Regression introduced here, fixed in v1.4.1 above**: Deposit's and e-Money's Transactions/Statement entries incorrectly nested `domainCode`/`familyCode`/`subFamilyCode` under a new `commonTransactionCode` object, and Deposit's Transactions response array key was changed to `statementEntries` — neither matches the real v1.0.1 schema.
- Added SLA/behavior notes: max 5 accounts per dataset per complete-consent call (else error 40400); `source_signature`/`signature_signing_algorithm`/`signature_signing_key_version`/`data_salt` added to more example responses; clarified `validate_service_extension` semantics (subset match, paired with an explicit `service_extension: []` on every `consent_token` service_id_list entry) and that all four registration fields are required on a service_id's _first_ registration (only optional on updates).
- Switched example `language` fields from `"TH"` to `"EN"` throughout.

## v1.3

The big breaking change — removed `service_extension`-based Basic/Detail + Lookback selection entirely, per regulator review feedback (2026-07-21) that `service_id` selection must be a separate concern from `service_extension`, never conflated into one control:

- Each combination of tier (Basic/Detail) × lookback period (6/12 months) became its own distinct `service_id` — `_basic_001`/`_basic_002`/`_detail_001`/`_detail_002` — for Deposit, e-Money Transactions/Statement, and Card Payment Transactions.
- Removed the now-obsolete `AS_EXTENSION_RULES`, `resolveAsExtension()`, and `getExtensionErrors()` functions, the Service Extension radio-button UI, and the error-40400 "missing Basic/Detail or Lookback" rejection demo path — there's nothing left to default or validate once each combination is its own concrete `service_id`.
- Rewrote lookback-date validation: from exact calendar-month subtraction to `maxLookbackDate` rounded down to the 1st of the month, with `fromDate`/`toDate` checked independently against it.
- Refactored mock response generators into shared functions parametrized by a `hasDetail` boolean (`depositTransactionsMock`, `depositStatementMock`, `cardpaymentTransactionsMock`, `emoneyTransactionsMock`, `emoneyStatementMock`) instead of one function per old service_extension-driven service_id.
- Added a "Request Timeouts & SLAs" reference table (Pre-consent: 5min timeout / 5s AS SLA; Complete-consent: 180s / 150s; Request-data: 5–15min / 5min).
- Changed masked-identifier placeholder style from asterisks (`***-***-1234`, `****-****-****-1111`) to `X`s (`XXX-XXX-1234`, `XXXX-XXXX-XXXX-1111`).
- Complete-consent `request_timeout` changed 900s → 180s; AS service registration example `min_aal` 2.2 → 2.1.

## v1.2

- Added `request_type: "AuthenOnly"` to the pre-consent NDID request.
- Changed `min_aal`/`max_aal`/`aal` from 2.2 → 2.1 throughout examples; pre-consent `request_timeout` changed 600s → 300s.
- Shortened the `one_time` token redemption window from 30 days to 24 hours (`expiration_datetime`), with clarifying comments added at both call sites (Step 3 and the matching Step 4 reconstruction).

## v1.1

Earliest version with a local copy available — no v1.0 (or earlier) snapshot was available to diff against, so changes introduced in v1.1 itself aren't documented here.
