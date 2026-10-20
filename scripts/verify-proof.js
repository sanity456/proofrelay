import { readFileSync } from 'node:fs';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const proof = JSON.parse(readFileSync(new URL('../deploy/proof.json', import.meta.url), 'utf8'));
const client = createClient({ chain: studionet });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isSuccessfulFinalized(receipt) {
  if (receipt?.statusName !== 'FINALIZED' && receipt?.status !== 7) return false;
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_RETURN' || receipt?.txExecutionResult === 1) return true;
  return receipt?.txExecutionResult == null && receipt?.txExecutionResultName == null
    && [1, 6, 'AGREE', 'MAJORITY_AGREE'].includes(receipt?.resultName ?? receipt?.result);
}

async function verifyFinalized(hash, label) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5000,
    retries: 2,
  });
  assert(isSuccessfulFinalized(receipt), `${label} is not finalized successfully.`);
}

const probe = proof.source_probe;
const probeConfig = await client.readContract({
  address: probe.contract_address,
  functionName: 'get_config',
  args: [],
});
assert(probeConfig?.product === 'ProofRelay Source Probe', 'Probe contract identity mismatch.');
const probeResult = await client.readContract({
  address: probe.contract_address,
  functionName: 'get_last_result',
  args: [],
});
assert(probeResult?.result === probe.outcome, 'Probe outcome differs from proof manifest.');
assert(probeResult?.revision_id === probe.revision_id, 'Probe revision differs from proof manifest.');
assert(probeResult?.quote === probe.quote, 'Probe quote differs from proof manifest.');
await verifyFinalized(probe.finalized_check_transaction, 'Source probe transaction');

const report = {
  network: proof.network.name,
  chainId: proof.network.chain_id,
  sourceProbe: {
    address: probe.contract_address,
    outcome: probeResult.result,
    revisionId: probeResult.revision_id,
    transaction: probe.finalized_check_transaction,
    finalized: true,
  },
  productContract: { ...proof.product_contract },
};

if (proof.product_contract.contract_address) {
  const productConfig = await client.readContract({
    address: proof.product_contract.contract_address,
    functionName: 'get_config',
    args: [],
  });
  assert(productConfig?.product === 'ProofRelay', 'Product contract identity mismatch.');
  assert(productConfig?.criteria_hash === proof.product_contract.criteria_hash, 'Product criteria hash mismatch.');
  if (proof.product_contract.deployment_transaction) {
    await verifyFinalized(proof.product_contract.deployment_transaction, 'Product deployment');
  }
  report.productContract = {
    address: proof.product_contract.contract_address,
    criteriaHash: productConfig.criteria_hash,
    finalized: Boolean(proof.product_contract.deployment_transaction),
    cases: [],
  };
  for (const expected of proof.product_contract.cases || []) {
    const record = await client.readContract({
      address: proof.product_contract.contract_address,
      functionName: 'get_record',
      args: [expected.record_id],
    });
    assert(record?.id === expected.record_id, `Record ${expected.record_id} is missing.`);
    assert(record?.claim === expected.claim, `Record ${expected.record_id} claim mismatch.`);
    assert(record?.original_revision === expected.revision_id, `Record ${expected.record_id} revision mismatch.`);
    assert(record?.original_quote === expected.quote, `Record ${expected.record_id} quote mismatch.`);
    assert(record?.original_outcome === expected.outcome, `Record ${expected.record_id} outcome mismatch.`);
    assert(record?.owner?.toLowerCase() === expected.owner.toLowerCase(), `Record ${expected.record_id} owner mismatch.`);
    for (const field of ['current_revision', 'current_quote', 'current_outcome', 'current_proposal']) {
      if (expected[field] != null) assert(record?.[field] === expected[field], `Record ${expected.record_id} ${field} mismatch.`);
    }
    await verifyFinalized(expected.transaction, `Record ${expected.record_id} transaction`);
    const proposals = await client.readContract({
      address: proof.product_contract.contract_address,
      functionName: 'list_record_proposals',
      args: [expected.record_id],
    });
    const verifiedProposals = [];
    for (const expectedProposal of expected.proposals || []) {
      const proposal = await client.readContract({
        address: proof.product_contract.contract_address,
        functionName: 'get_proposal',
        args: [expectedProposal.proposal_id],
      });
      assert(proposal?.id === expectedProposal.proposal_id, `Proposal ${expectedProposal.proposal_id} is missing.`);
      assert(proposal?.record_id === expected.record_id, `Proposal ${expectedProposal.proposal_id} record mismatch.`);
      assert(proposal?.base_revision === expectedProposal.base_revision, `Proposal ${expectedProposal.proposal_id} base revision mismatch.`);
      assert(proposal?.base_quote === expectedProposal.base_quote, `Proposal ${expectedProposal.proposal_id} base quote mismatch.`);
      assert(proposal?.candidate_revision === expectedProposal.candidate_revision, `Proposal ${expectedProposal.proposal_id} candidate revision mismatch.`);
      assert(proposal?.candidate_quote === expectedProposal.candidate_quote, `Proposal ${expectedProposal.proposal_id} candidate quote mismatch.`);
      assert(proposal?.outcome === expectedProposal.outcome, `Proposal ${expectedProposal.proposal_id} outcome mismatch.`);
      assert(proposal?.adopted === expectedProposal.adopted, `Proposal ${expectedProposal.proposal_id} adoption state mismatch.`);
      assert(proposal?.proposer?.toLowerCase() === expectedProposal.proposer.toLowerCase(), `Proposal ${expectedProposal.proposal_id} proposer mismatch.`);
      assert(proposals?.some(item => item.id === expectedProposal.proposal_id), `Proposal ${expectedProposal.proposal_id} is absent from the record history.`);
      await verifyFinalized(expectedProposal.transaction, `Proposal ${expectedProposal.proposal_id} transaction`);
      if (expectedProposal.adopted) {
        assert(record?.current_revision === expectedProposal.candidate_revision, `Record ${expected.record_id} current revision does not match adopted proposal ${expectedProposal.proposal_id}.`);
        assert(record?.current_quote === expectedProposal.candidate_quote, `Record ${expected.record_id} current quote does not match adopted proposal ${expectedProposal.proposal_id}.`);
        assert(record?.current_outcome === expectedProposal.outcome, `Record ${expected.record_id} current outcome does not match adopted proposal ${expectedProposal.proposal_id}.`);
        assert(record?.current_proposal === expectedProposal.proposal_id, `Record ${expected.record_id} does not point to adopted proposal ${expectedProposal.proposal_id}.`);
        assert(expectedProposal.adoption_transaction, `Proposal ${expectedProposal.proposal_id} is marked adopted without an adoption transaction.`);
        await verifyFinalized(expectedProposal.adoption_transaction, `Proposal ${expectedProposal.proposal_id} adoption transaction`);
      }
      verifiedProposals.push({
        proposalId: proposal.id,
        outcome: proposal.outcome,
        candidateRevision: proposal.candidate_revision,
        adopted: proposal.adopted,
        transaction: expectedProposal.transaction,
        adoptionTransaction: expectedProposal.adoption_transaction ?? null,
        finalized: true,
      });
    }
    report.productContract.cases.push({
      recordId: record.id,
      outcome: record.original_outcome,
      revisionId: record.original_revision,
      owner: record.owner,
      transaction: expected.transaction,
      finalized: true,
      proposals: verifiedProposals,
    });
  }
  const adversarial = proof.known_adversarial_failure;
  if (adversarial) {
    const record = await client.readContract({
      address: adversarial.contract_address,
      functionName: 'get_record',
      args: [adversarial.record_id],
    });
    assert(record?.id === adversarial.record_id, 'Adversarial test record is missing.');
    assert(record?.claim === adversarial.claim, 'Adversarial test claim mismatch.');
    assert(record?.original_revision === adversarial.revision_id, 'Adversarial test revision mismatch.');
    assert(record?.original_quote === adversarial.quote, 'Adversarial test quote mismatch.');
    assert(record?.original_outcome === adversarial.observed_outcome, 'Adversarial test outcome mismatch.');
    report.securityAdversarialTest = {
      recordId: record.id,
      expectedOutcome: adversarial.expected_outcome,
      observedOutcome: record.original_outcome,
      vulnerabilityConfirmed: true,
    };
  }
}

console.log(JSON.stringify(report, null, 2));
