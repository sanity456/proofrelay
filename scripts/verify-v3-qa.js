import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const proof = JSON.parse(readFileSync(new URL('../deploy/v3-qa.json', import.meta.url), 'utf8'));
const client = createClient({ chain: studionet });
const address = proof.contract_address;

async function read(functionName, args = []) {
  return client.readContract({ address, functionName, args });
}

async function verifyReceipt(label, hash, expectedExecution) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: 'FINALIZED',
    interval: 5000,
    retries: 2,
  });
  assert.equal(receipt.status, 7, `${label}: not finalized`);
  assert.equal(receipt.consensus_data?.leader_receipt?.[0]?.execution_result, expectedExecution,
    `${label}: unexpected execution result`);
}

const config = await read('get_config');
assert.equal(config.product, 'ProofRelay');
assert.equal(config.criteria_version, proof.criteria_version);
assert.equal(config.criteria_hash, proof.criteria_hash);

const expected = proof.expected_state;
assert.deepEqual(await read('list_records'), expected.record_ids);
const record = await read('get_record', ['R1']);
for (const key of ['claim', 'original_revision', 'original_quote', 'current_revision',
  'current_quote', 'current_proposal']) {
  assert.equal(record[key], expected[key], `R1 ${key} mismatch`);
}
assert.equal(record.owner.toLowerCase(), proof.publisher.toLowerCase());
assert.equal(record.original_outcome, 'SUPPORTED');
assert.equal(record.current_outcome, 'PRESERVES_SCOPE');
assert.deepEqual(await read('get_record', ['R2']), {});

const proposals = await read('list_record_proposals', ['R1']);
assert.deepEqual(proposals.map(item => item.id), expected.proposals.map(item => item.id));
for (const item of expected.proposals) {
  const proposal = await read('get_proposal', [item.id]);
  assert.equal(proposal.record_id, 'R1');
  assert.equal(proposal.base_revision, item.id === 'P1' ? expected.original_revision : expected.current_revision);
  for (const key of ['candidate_revision', 'candidate_quote', 'outcome', 'adopted']) {
    assert.equal(proposal[key], item[key], `${item.id} ${key} mismatch`);
  }
}

for (const [label, hash] of Object.entries(proof.transactions)) {
  await verifyReceipt(label, hash, label === 'adversarial_rejection' ? 'ERROR' : 'SUCCESS');
}

console.log(JSON.stringify({
  network: proof.network,
  contract: address,
  policy: proof.criteria_version,
  record: 'R1',
  originalRevision: record.original_revision,
  currentRevision: record.current_revision,
  proposals: proposals.map(item => ({ id: item.id, outcome: item.outcome, adopted: item.adopted })),
  noR2: true,
  finalizedTransactions: Object.keys(proof.transactions),
  limitations: proof.limitations,
}, null, 2));
