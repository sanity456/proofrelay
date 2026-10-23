# ProofRelay v5 architecture

## Product boundary

- **Browser:** wallet connection, form bounds, record browsing, transaction recovery, and non-authoritative status labels. It never decides a review outcome.
- **Source probe v2:** confirms that StudioNet validators can retrieve one pinned revision through Wikimedia's revision REST route before product deployment is enabled.
- **ProofRelay v5:** freezes original evidence, stores append-only repairs and challenges, enforces ownership and limits, and permits adoption only for a current `PRESERVES_SCOPE` proposal.
- **Wikimedia:** returns permanent revision source text. Contract code verifies the requested revision ID, isolates text before the first section heading, and checks the submitted passage verbatim.
- **GenLayer consensus:** leader and validators independently retrieve the source and repeat one bounded classification. Consensus records what the passage supports under the fixed policy, not objective truth.

## State transitions

```text
create_record
  exact pinned lead quote + SUPPORTED
  -> immutable R1 original fields + current pointer

propose_correction
  independently retrieve current and candidate revisions
  -> append Pn with PRESERVES_SCOPE / CHANGES_SCOPE / CONTRADICTS / INSUFFICIENT_EVIDENCE

adopt_correction
  publisher only + non-stale PRESERVES_SCOPE
  -> update current pointer; preserve original and full proposal history

submit_challenge
  any wallet + different pinned revision + exact lead quote
  -> append Cn with SUPPORTS / CONTRADICTS / INSUFFICIENT_EVIDENCE
  -> never rewrite record or correction history
```

## Reliability and safety rules

- V5 uses `https://en.wikipedia.org/w/rest.php/v1/revision/{id}` rather than the rate-limited parse route encountered during live v4 QA.
- HTTP 429 and server failures are transient errors; they do not become substantive evidence outcomes.
- Revision IDs are numeric and bounded. Claims and quotes are length-bounded; initial claims must be one declarative sentence.
- Evidence is JSON-encoded and explicitly framed as untrusted data. Known evaluator-override patterns are rejected before LLM review. This is defense in depth, not a general prompt-injection guarantee.
- A record is created only for `SUPPORTED`. A repair can be adopted only for `PRESERVES_SCOPE`. Challenges are capped at 20 per record.
- No GEN is escrowed and no payout function exists. Calls carry zero application value; network fees may still apply.

## Release identity

- Network: GenLayer StudioNet, chain `61999`.
- Source probe: `0x6aaDc78aFa8E801044c2F6cE8C9c22aEcA31c896`, rules `probe-2`.
- Product: `0xc5D1552D153015Bc75a6818d0642823d6179e1c0`.
- Policy: `proofrelay-scope-5`.
- Policy SHA-256: `3878892bb986593d108952ae997ef4702e35fd19fab83751d18911b8b3bbba43`.

The live evidence manifest is `deploy/v5-qa.json`. It records the finalized source probe, R1, P1 and its adoption, and C1. `scripts/verify-v5-qa.js` reads the current chain state and fails if the release identity or expected state differs.

## Observed live state

- Probe returned `MATCH` for revision `1380958329` and “landing in the Sea of Tranquility.”
- R1 finalized `SUPPORTED` using revision `1380958329`.
- P1 finalized `PRESERVES_SCOPE` using revision `1380944587` and was adopted by the publisher.
- R1 still exposes the immutable original revision while its current pointer references P1.
- C1 was submitted by another wallet and finalized `INSUFFICIENT_EVIDENCE`; it remains a separate append-only review.

These are narrow, reproducible testnet observations. A second Wikipedia revision is not an independent source, validator consensus can be inconclusive, Wikipedia can be incomplete, and the publisher retains control over adoption.
