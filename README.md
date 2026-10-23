# ProofRelay

**ProofRelay is a public citation-review registry for factual claims.** A publisher freezes a claim and its original source passage. GenLayer validators then review proposed citation repairs and public challenges against permanent Wikipedia revisions. The original evidence and every review remain auditable; only the publisher may adopt a finalized `PRESERVES_SCOPE` repair.

**Live app:** [proofrelay-taupe.vercel.app](https://proofrelay-taupe.vercel.app) · **Repository:** [github.com/sanity456/proofrelay](https://github.com/sanity456/proofrelay)

ProofRelay runs on GenLayer StudioNet, chain `61999`. Test GEN has no monetary value. Contract calls send no application value, although network fees may apply. This is a public testnet demonstration, not a production fact-checking or financial service.

## V5 milestone

V5 solves a concrete reliability problem discovered during live QA: Wikipedia's older parse endpoint rate-limited validator requests. The new release retrieves immutable revisions through Wikimedia's revision REST route, isolates the lead section deterministically, treats HTTP 429 and server failures as transient, and gates product deployment behind a separate live source-access probe.

It also carries forward the milestone's public challenge feature. Any wallet can append a pinned passage to a record for validator review. A challenge receives `SUPPORTS`, `CONTRADICTS`, or `INSUFFICIENT_EVIDENCE`, but never rewrites the claim, original citation, current citation, or repair history. This is same-source public review, not proof of independent publisher or source corroboration.

## Why GenLayer

Determining whether a passage supports a whole claim, or whether a replacement preserves its exact scope, requires interpretation. The leader returns one fixed outcome while validators independently fetch the same permanent revision, verify the exact quote in their own copy, and repeat the narrow judgment. Contract logic controls record creation, history, ownership, limits, and adoption.

```text
Browser + wallet
      │ signed writes / public reads
      ▼
ProofRelay v5 ── independent validator retrieval ──► Wikimedia revision REST API
  • immutable original evidence                      • permanent revision IDs
  • append-only repairs and challenges               • deterministic lead isolation
  • publisher-only safe adoption                     • exact passage verification
```

## Verified StudioNet evidence

- Source probe v2: [`0x6aaDc7…1c896`](https://explorer-studio.genlayer.com/address/0x6aaDc78aFa8E801044c2F6cE8C9c22aEcA31c896). Its [live check](https://explorer-studio.genlayer.com/tx/0x4fa28e7540947dafc7227440b59e2d50d6067ed73dd7da7092812cbfdb66fbbe) finalized `MATCH` for revision `1380958329` and the exact passage “landing in the Sea of Tranquility.”
- ProofRelay v5: [`0xc5D155…9e1c0`](https://explorer-studio.genlayer.com/address/0xc5D1552D153015Bc75a6818d0642823d6179e1c0), policy `proofrelay-scope-5`, SHA-256 `3878892bb986593d108952ae997ef4702e35fd19fab83751d18911b8b3bbba43`.
- [R1 creation](https://explorer-studio.genlayer.com/tx/0xe57a3b1522217bbb6229257112d3faa293c0cd181e1ffec4c2faa3223e320bf3) finalized `SUPPORTED` for “Apollo 11 landed in the Sea of Tranquility.”
- [P1](https://explorer-studio.genlayer.com/tx/0xa5698a0855dd3bf0e7daa35850d043e559a6c8cdd9ad70a62a72f19d7f55b246) finalized `PRESERVES_SCOPE`; the publisher [adopted it](https://explorer-studio.genlayer.com/tx/0x2408b798a6301e1949929c596c4c525e0a1d8ea3e94f78f2e7e7ce89a885e5e6). Chain state now points to revision `1380944587` while preserving original revision `1380958329`.
- Account 8 submitted [public challenge C1](https://explorer-studio.genlayer.com/tx/0x49b1cc7b2c69f10086f8a4a3a7ef4b793886b7984d3e1e0dbd6c64574c7f77bb), which finalized `INSUFFICIENT_EVIDENCE`. That conservative result is recorded separately and did not change R1.

The exact expected state is stored in [`deploy/v5-qa.json`](deploy/v5-qa.json) and can be checked against StudioNet with `npm run verify:v5-qa`. These observed outcomes are deliberately narrow. They do not establish objective truth, universal validator access, source independence, or protection from every prompt-injection strategy.

## Contract interface

- `create_record(claim, source_revision, source_quote)` creates a record only after a `SUPPORTED` result.
- `propose_correction(record_id, candidate_revision, candidate_quote)` appends a fixed review outcome.
- `adopt_correction(proposal_id)` lets only the publisher adopt a current, finalized `PRESERVES_SCOPE` proposal.
- `submit_challenge(record_id, source_revision, source_quote)` lets any wallet append one of at most 20 reviews without rewriting the record.
- `get_record`, `get_proposal`, `get_challenge`, and their list methods expose public state.

Inputs are bounded and revision IDs contain digits only. The contract rejects known evaluator-override strings before invoking an LLM, JSON-encodes evidence as untrusted data, and asks validators to repeat both source retrieval and classification. These controls reduce risk but are not a complete security proof.

## Run and verify

Requirements: Node.js 24 and Python 3.12 with packages from `requirements-dev.txt`.

```powershell
npm install
npm run dev
```

```powershell
python -m pip install -r requirements-dev.txt
$artifacts = Join-Path $env:TEMP ('proofrelay-direct-' + [guid]::NewGuid().ToString('N'))
python -m pytest tests/direct -q --artifacts-dir $artifacts
npm run build
npm run verify:v5-qa
```

For GenVM semantic validation, use a compatible cached bundle while retaining the concrete runner hash pinned in each contract:

```powershell
$env:GENVM_VERSION = 'v0.3.0-rc7'
genvm-lint check contracts/source_probe.py --json
genvm-lint check contracts/proofrelay.py --json
```

Every write is asynchronous. The web app stores its pending transaction hash and offers **Check status** after a reload. Review each request in MetaMask and sign it yourself. Do not resubmit an ambiguous transaction until its explorer status has been checked.

## Historical releases

V1 accepted one adversarial claim, v2 rejected an ordinary honest claim, and v3 supplied the earlier reviewed correction demo. Those immutable deployments remain historical evidence and are not used for new writes. Their evidence files are retained in `deploy/`; the current application is pinned to the separate v5 addresses in `deployment.json`.

## Two-minute demonstration

1. Show the source-probe `MATCH` and open its explorer transaction.
2. Open R1 and compare its immutable original revision with the adopted current revision.
3. Expand P1 to show `PRESERVES_SCOPE` and publisher-controlled adoption.
4. Expand C1 to show a different wallet's append-only `INSUFFICIENT_EVIDENCE` challenge.
5. Explain the boundary: ProofRelay preserves and reviews citations under a fixed policy; it does not certify universal truth.
