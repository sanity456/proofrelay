import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const proof = JSON.parse(readFileSync(new URL('../deploy/v5-qa.json', import.meta.url), 'utf8'));
const client = createClient({ chain: studionet });

async function read(address, functionName, args = []) {
  return client.readContract({ address, functionName, args });
}

const probeConfig = await read(proof.probe_address, 'get_config');
assert.equal(probeConfig.product, 'ProofRelay Source Probe');
assert.equal(probeConfig.rules_version, 'probe-2');
assert.deepEqual(await read(proof.probe_address, 'get_last_result'), proof.expected_probe);

const config = await read(proof.contract_address, 'get_config');
assert.equal(config.product, 'ProofRelay');
assert.equal(config.criteria_version, proof.criteria_version);
assert.equal(config.criteria_hash, proof.criteria_hash);

const expected = proof.expected_state;
assert.deepEqual(await read(proof.contract_address, 'list_records'), expected.record_ids);
const record = await read(proof.contract_address, 'get_record', ['R1']);
for (const key of ['claim', 'original_revision', 'original_quote', 'original_outcome',
  'current_revision', 'current_quote', 'current_outcome', 'current_proposal']) {
  assert.equal(record[key], expected[key], `R1 ${key} mismatch`);
}
assert.equal(record.owner.toLowerCase(), proof.publisher.toLowerCase());

const proposals = await read(proof.contract_address, 'list_record_proposals', ['R1']);
assert.equal(proposals.length, 1);
for (const key of ['id', 'base_revision', 'candidate_revision', 'candidate_quote', 'outcome', 'adopted']) {
  assert.equal(proposals[0][key], expected.proposal[key], `P1 ${key} mismatch`);
}

const challenges = await read(proof.contract_address, 'list_record_challenges', ['R1']);
assert.equal(challenges.length, 1);
for (const key of ['id', 'source_revision', 'source_quote', 'outcome']) {
  assert.equal(challenges[0][key], expected.challenge[key], `C1 ${key} mismatch`);
}
assert.equal(challenges[0].challenger.toLowerCase(), proof.challenger.toLowerCase());

console.log(JSON.stringify({
  network: proof.network,
  probe: proof.probe_address,
  probeResult: proof.expected_probe.result,
  contract: proof.contract_address,
  policy: proof.criteria_version,
  record: 'R1',
  originalRevision: record.original_revision,
  currentRevision: record.current_revision,
  proposal: { id: proposals[0].id, outcome: proposals[0].outcome, adopted: proposals[0].adopted },
  challenge: { id: challenges[0].id, outcome: challenges[0].outcome },
  evidenceTransactions: proof.transactions,
  limitations: proof.limitations,
}, null, 2));
