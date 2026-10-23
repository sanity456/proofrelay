import './style.css';
import './pending-layout.css';
import proofRelayLogo from './assets/proofrelay-logo.svg';
import {
  adoptCorrection, configuredProbeAddress, configuredProductAddress, createRecord, deployProbe, deployProduct,
  explorerAddress, explorerTx, forgetPending, pendingAction, proposeCorrection, read,
  inspect, PRODUCT_CRITERIA_HASH, PRODUCT_CRITERIA_VERSION, rememberPending, requestWallet, safeError,
  saveProbeAddress, saveProductAddress, short, submitChallenge, verifyProbe, verifyProduct,
  waitForFinality,
} from './lib/chain.js';

const sampleRevision = '1380958329';
const sampleClaim = 'Apollo 11 landed in the Sea of Tranquility.';
const sampleQuote = 'landing in the Sea of Tranquility';
const CLAIM_SHAPE = /^[\p{L}\p{N} ,'()-]+\.$/u;
const FINALIZED_EXECUTION_FAILURE = 'This transaction did not finalize successfully. Check its explorer entry.';
const liveExample = {
  record: '0xe57a3b1522217bbb6229257112d3faa293c0cd181e1ffec4c2faa3223e320bf3',
  challenge: '0x49b1cc7b2c69f10086f8a4a3a7ef4b793886b7984d3e1e0dbd6c64574c7f77bb',
  preserving: '0xa5698a0855dd3bf0e7daa35850d043e559a6c8cdd9ad70a62a72f19d7f55b246',
  adoption: '0x2408b798a6301e1949929c596c4c525e0a1d8ea3e94f78f2e7e7ce89a885e5e6',
};
const state = {
  account: '', probeAddress: configuredProbeAddress(), probeResult: null,
  contract: configuredProductAddress(), productConfig: null, productCompatible: false,
  records: [], pending: pendingAction(), loading: true, recordsError: '', probeError: '', contractError: '',
  busy: false, notice: '', error: '', lastTx: '',
};
const app = document.querySelector('#app');

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function statusClass(status = '') {
  return ['SUPPORTED', 'PRESERVES_SCOPE', 'MATCH'].includes(status) ? 'good' : 'bad';
}
function outcomeMeaning(status = '') {
  return ({
    SUPPORTED: 'Validators agreed that this pinned passage supports the submitted claim under the contract criteria. This is source support, not proof of objective truth.',
    NOT_SUPPORTED: 'Validators did not find enough support for the full claim in this passage.',
    INSUFFICIENT_EVIDENCE: 'The source or validator result did not provide enough evidence for a decision.',
    PRESERVES_SCOPE: 'The proposed citation keeps the same subject, event, time, and material qualifiers.',
    CHANGES_SCOPE: 'The proposed citation changes a material part of the claim, so the contract does not offer it for adoption.',
    CONTRADICTS: 'The proposed citation conflicts with the claim.',
    SUPPORTS: 'This pinned passage directly supports the unchanged claim under the challenge criteria.',
    MATCH: 'Validators independently retrieved the pinned source and exact passage for this probe.',
  })[status] || 'This is the recorded validator outcome; review the pinned evidence and transaction history.';
}
function txLink(hash) { return hash ? `<a href="${explorerTx(hash)}" target="_blank" rel="noreferrer">Explorer ↗</a>` : ''; }
function sameAddress(left, right) { return Boolean(left && right) && left.toLowerCase() === right.toLowerCase(); }
function canOfferAdoption(record, proposal) {
  return state.productCompatible && proposal.outcome === 'PRESERVES_SCOPE' && !proposal.adopted
    && proposal.base_revision === record.current_revision
    && (!state.account || sameAddress(state.account, record.owner));
}

function renderRecords() {
  if (state.loading) return '<div class="load-state" role="status"><span class="spinner"></span><span>Loading the source probe and records from GenLayer Studionet…</span></div>';
  if (state.recordsError) return `<div class="load-state load-error" role="alert"><span>${esc(state.recordsError)}</span><button class="secondary" data-action="refresh">Retry loading</button></div>`;
  if (!state.contract) return '<p class="empty">Deploy the ProofRelay registry to start a record. This deployment sends 0 GEN; network fees may apply.</p>';
  if (!state.records.length) return `<p class="empty">${state.productCompatible ? 'No records yet. Create a factual claim with an exact quote from a permanent Wikipedia revision.' : 'This older deployment is read-only. Its historical records remain available for review.'}</p>`;
  return state.records.map(({ record, proposals, challenges }) => `
    <article class="record-card">
      <div class="record-top"><div><span class="step">${esc(record.id)} · ${esc(record.criteria_version)}</span><h3>${esc(record.claim)}</h3></div><span class="pill ${statusClass(record.current_outcome)}" title="${esc(outcomeMeaning(record.current_outcome))}">${esc(record.current_outcome)}</span></div>
      <p class="outcome-note">${esc(outcomeMeaning(record.current_outcome))}</p>
      <div class="evidence-pair"><div><small>ORIGINAL · IMMUTABLE</small><p>Revision ${esc(record.original_revision)}</p><blockquote>“${esc(record.original_quote)}”</blockquote></div><div><small>CURRENT CITATION</small><p>Revision ${esc(record.current_revision)}</p><blockquote>“${esc(record.current_quote)}”</blockquote></div></div>
      <div class="record-actions"><a href="https://en.wikipedia.org/w/index.php?oldid=${encodeURIComponent(record.current_revision)}" target="_blank" rel="noreferrer">Open current revision ↗</a>${state.productCompatible ? `<details><summary>Propose a citation repair</summary><form data-form="correction" data-record="${esc(record.id)}"><label>New permanent revision ID</label><input name="revision" inputmode="numeric" maxlength="16" placeholder="Wikipedia oldid" required /><label>Exact quote from its lead section</label><textarea name="quote" maxlength="600" rows="2" placeholder="Paste the exact sentence or passage" required></textarea><button class="primary" type="submit" ${state.busy || state.pending ? 'disabled' : ''}>Evaluate repair <span>↗</span></button></form></details>` : '<p class="field-note">Read-only: this record uses a legacy policy version. New proposals are disabled.</p>'}</div>
      <div class="proposal-list"><h4>Repair history <span>${proposals.length}</span></h4>${proposals.length ? proposals.map(proposal => `
        <div class="proposal"><div class="proposal-top"><b>${esc(proposal.id)} · ${esc(proposal.outcome)}</b>${proposal.adopted ? '<span class="pill good">CURRENT</span>' : ''}</div><p>${esc(outcomeMeaning(proposal.outcome))}</p><p>Candidate revision ${esc(proposal.candidate_revision)}</p><blockquote>“${esc(proposal.candidate_quote)}”</blockquote>${canOfferAdoption(record, proposal) ? `<button class="secondary" data-action="adopt" data-proposal="${esc(proposal.id)}" ${state.busy || state.pending ? 'disabled' : ''}>Adopt this repair</button>` : ''}</div>`).join('') : '<p class="empty">No correction proposals yet.</p>'}</div>
      ${state.productCompatible ? `<details class="challenge-panel"><summary>Challenge this record with pinned evidence</summary><p class="field-note">Anyone can add another permanent Wikipedia revision and an exact lead quote. Validators classify it as support, contradiction, or insufficient evidence. Challenges append to history and do not rewrite the claim. This is not independent publisher verification.</p><form data-form="challenge" data-record="${esc(record.id)}"><label>Different permanent revision ID</label><input name="revision" inputmode="numeric" maxlength="16" placeholder="Wikipedia oldid" required /><label>Exact quote from that revision’s lead</label><textarea name="quote" maxlength="600" rows="2" placeholder="Paste the exact passage" required></textarea><button class="primary" type="submit" ${state.busy || state.pending ? 'disabled' : ''}>Submit challenge <span>↗</span></button></form></details>` : ''}
      <div class="proposal-list challenge-list"><h4>Public challenge timeline <span>${challenges.length}</span></h4>${challenges.length ? challenges.map(challenge => `
        <div class="proposal"><div class="proposal-top"><b>${esc(challenge.id)} · ${esc(challenge.outcome)}</b><span class="pill ${statusClass(challenge.outcome)}">PINNED EVIDENCE</span></div><p>${esc(outcomeMeaning(challenge.outcome))}</p><p>Revision ${esc(challenge.source_revision)} · challenger ${esc(short(challenge.challenger))}</p><blockquote>“${esc(challenge.source_quote)}”</blockquote><a href="https://en.wikipedia.org/w/index.php?oldid=${encodeURIComponent(challenge.source_revision)}" target="_blank" rel="noreferrer">Open challenged evidence ↗</a></div>`).join('') : '<p class="empty">No public challenges yet. A challenge adds a separate review entry; the original record remains unchanged.</p>'}</div>
    </article>`).join('');
}

function render() {
  const pendingLabel = state.pending ? `${esc(state.pending.kind)} · ${esc(short(state.pending.hash))}` : '';
  app.innerHTML = `
    <main class="shell">
      <header class="topbar"><a class="brand" href="#" aria-label="ProofRelay home"><img src="${proofRelayLogo}" alt="ProofRelay" width="500" height="136" /></a><div class="top-meta"><span class="network-dot"></span><span>GENLAYER STUDIONET · 61999</span><button class="wallet" data-action="connect">${state.account ? esc(short(state.account)) : 'Connect wallet'}</button></div></header>
      <section class="hero product-hero"><div class="eyebrow">CITATION REPAIR REGISTRY · ${state.loading ? 'CONNECTING TO STUDIONET' : state.productCompatible ? 'PUBLIC STUDIONET DEMO · V5' : state.contract ? 'OLDER DEPLOYMENT · READ-ONLY' : 'SETUP'}</div><h1>Keep the evidence.<br><em>Repair the citation.</em></h1><p class="lede">Freeze a factual claim and its permanent source passage. GenLayer validators independently check proposed citation fixes for the same scope and time before a publisher can adopt one. This public demo runs on StudioNet, a test network.</p><div class="hero-proof"><div class="orb"><span>PR</span><i></i></div><div class="proof-label"><small>CONSENSUS OUTCOME</small><strong>${state.productCompatible ? 'Scope reviewed' : state.contract ? 'Read-only older deployment' : 'Evidence first'}</strong></div><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div></div></section>
      <section class="gate ${state.probeResult?.result === 'MATCH' ? 'gate-good' : ''}"><div><span class="step">01 / SOURCE ACCESS CHECK</span><h2>${state.loading ? 'Checking validator source access…' : state.probeResult?.result === 'MATCH' ? 'Validator source access confirmed' : state.probeError ? 'Deploy the REST source probe' : state.probeAddress ? 'Run the REST source check' : 'Deploy the REST source probe'}</h2><p>${state.probeResult?.result === 'MATCH' ? `StudioNet finalized MATCH for Wikipedia revision ${esc(state.probeResult.revision_id)} and the exact passage “${esc(state.probeResult.quote)}”. This confirms validator access through the pinned revision REST route.` : state.loading ? 'Reading the finalized source probe from StudioNet.' : state.probeError ? 'The earlier probe uses the rate-limited parse route. Deploy probe v2 before deploying ProofRelay v5.' : state.probeAddress ? 'The probe v2 contract is verified. Run its exact revision check before deploying the product.' : 'Deploy the source probe before the product contract.'}</p>${state.probeAddress && !state.probeError ? `<div class="probe-actions"><a href="${explorerAddress(state.probeAddress)}" target="_blank" rel="noreferrer">Probe contract ↗</a>${state.probeResult?.result !== 'MATCH' ? `<button class="secondary" data-action="inspect-probe" ${state.busy || state.pending ? 'disabled' : ''}>Run source check</button>` : ''}</div>` : `<button class="secondary" data-action="deploy-probe" ${state.busy || state.pending ? 'disabled' : ''}>Deploy probe v2</button>`}</section>
      <section class="panel setup-panel"><div class="panel-head"><div><div class="step">02 / PRODUCT CONTRACT</div><h2>${state.loading ? 'Checking ProofRelay on Studionet…' : state.productCompatible ? 'ProofRelay v5 · REST-source demo' : state.contractError ? 'Contract unavailable or incompatible' : state.contract ? 'Older ProofRelay deployment · read-only' : 'ProofRelay v5 · REST-source demo'}</h2></div><span class="badge">0 GEN transaction value</span></div><p class="panel-copy">${state.loading ? 'Loading the contract configuration. The interface is available while StudioNet responds.' : state.productCompatible ? 'V5 preserves citation challenges and retrieves pinned revisions through Wikimedia’s revision REST route. StudioNet is a test network; GEN has no monetary value.' : state.contractError ? `Writes are paused until this address can be verified as the expected ProofRelay v5 contract. ${esc(state.contractError)}` : 'Earlier deployments remain read-only. Deploy v5 only after probe v2 finalizes MATCH.'}</p>${state.contract ? `<div class="contract-line"><span>${state.productCompatible ? `${PRODUCT_CRITERIA_VERSION} · ${PRODUCT_CRITERIA_HASH.slice(0, 12)}…` : `Older ${esc(state.productConfig?.criteria_version || 'unverified policy')}`}</span><a href="${explorerAddress(state.contract)}" target="_blank" rel="noreferrer">${esc(short(state.contract))} on explorer ↗</a></div>` : ''}${!state.loading && !state.productCompatible && !state.contractError ? `<button class="secondary" data-action="deploy" ${state.busy || state.pending || state.probeResult?.result !== 'MATCH' ? 'disabled' : ''}>Deploy separate v5 contract</button>` : ''}</section>
      ${state.productCompatible ? `<section class="guided-example" aria-labelledby="guided-title"><div class="guided-heading"><div><div class="step">A VERIFIED V5 LIVE EXAMPLE</div><h2 id="guided-title">Follow one citation review from start to finish</h2><p>These links point to this v5 contract’s finalized StudioNet transactions. Outcomes describe source support under the fixed policy, not objective truth.</p></div><a class="secondary guided-jump" href="#records">View live record ↓</a></div><div class="guided-grid"><article><span>01 · ORIGINAL RECORD</span><h3>Apollo 11 landed in the Sea of Tranquility.</h3><p>Revision 1380958329 · outcome SUPPORTED · original evidence remains immutable.</p><a href="https://en.wikipedia.org/w/index.php?oldid=1380958329" target="_blank" rel="noreferrer">Open source revision ↗</a><a href="${explorerTx(liveExample.record)}" target="_blank" rel="noreferrer">View record transaction ↗</a></article><article><span>02 · CITATION REPAIR</span><h3>P1 · PRESERVES_SCOPE</h3><p>The publisher adopted revision 1380944587. The current pointer changed while the original citation stayed preserved.</p><a href="https://en.wikipedia.org/w/index.php?oldid=1380944587" target="_blank" rel="noreferrer">Open adopted revision ↗</a><a href="${explorerTx(liveExample.preserving)}" target="_blank" rel="noreferrer">Review proposal ↗</a><a href="${explorerTx(liveExample.adoption)}" target="_blank" rel="noreferrer">Review adoption ↗</a></article><article><span>03 · PUBLIC CHALLENGE</span><h3>C1 · INSUFFICIENT_EVIDENCE</h3><p>A different wallet appended a pinned review. It remains visible without rewriting R1 or its citation history.</p><a href="${explorerTx(liveExample.challenge)}" target="_blank" rel="noreferrer">Review challenge ↗</a></article></div><p class="guided-footnote">The live proof is deliberately narrow: one record, one adopted repair, and one public challenge. It does not establish universal validator access or source independence.</p></section>` : ''}
      <section class="workspace" id="records"><div class="workspace-heading"><div><div class="step">03 / PUBLIC EVIDENCE RECORDS</div><h2>Trace each citation change</h2><p>Only pinned Wikipedia lead sections are reviewed in this MVP. A validator consensus result means the cited passage supported the claim under the contract criteria; it does not prove the claim true.</p></div><button class="secondary" data-action="refresh" ${state.busy || state.loading ? 'disabled' : ''}>${state.loading ? 'Loading…' : 'Refresh records'}</button></div>
        ${state.productCompatible ? `<section class="panel create-panel"><div class="panel-head"><div><div class="step">NEW RECORD · INITIAL SUPPORT CHECK</div><h2>Freeze a factual claim</h2></div><span class="badge">No funds locked</span></div><form data-form="record"><label>One factual sentence <small>12–400 characters, ending in a period</small></label><textarea name="claim" maxlength="400" rows="2" required>${esc(sampleClaim)}</textarea><div class="form-grid"><div><label>Permanent Wikipedia revision ID</label><input name="revision" inputmode="numeric" maxlength="16" value="${sampleRevision}" required /></div><div><label>Exact source passage · up to 600 characters</label><textarea name="quote" maxlength="600" rows="2" required>${esc(sampleQuote)}</textarea></div></div><p class="field-note">The quote must occur verbatim in that revision’s lead section. Validators check for instructions in the claim, then assess whether the source supports the whole claim. A SUPPORTED result means the passage met this contract’s criteria; it is not an independent fact check. The claim and original citation remain frozen.</p><button class="primary" type="submit" ${state.busy || state.pending ? 'disabled' : ''}>Create record <span>↗</span></button></form></section>` : state.contract ? '<section class="gate"><div><span class="step">WRITES PAUSED</span><h2>Older contract is read-only</h2><p>Earlier deployed versions failed a live test. Their records remain available for audit, but this app will not send new writes to them.</p></div></section>' : ''}
        <div class="records">${renderRecords()}</div>
      </section>
      <section class="three-up"><article><span>01</span><h3>Freeze the citation</h3><p>The original claim, quote and permanent revision stay visible after later repairs.</p></article><article><span>02</span><h3>Judge one correction</h3><p>Validators independently fetch both pinned sources, verify the exact quotes and compare a fixed outcome.</p></article><article><span>03</span><h3>Adopt only a safe repair</h3><p>Only the publisher can adopt a finalized PRESERVES_SCOPE result; other outcomes remain in the history.</p></article></section>
      <footer><span>ProofRelay · StudioNet · versioned fixed-scope criteria</span><span>Consensus records source support; it does not certify objective truth.</span></footer>
      ${state.pending ? `<div class="pending sticky-pending"><span class="spinner"></span><div><b>${pendingLabel}</b><small>Waiting for consensus and finality. This transaction is saved locally and can be checked again.</small></div><button data-action="recover" ${state.busy ? 'disabled' : ''}>Check status</button></div>` : ''}
      ${state.notice ? `<div class="notice toast">${esc(state.notice)} ${txLink(state.lastTx)}</div>` : ''}${state.error ? `<div class="error toast" role="alert">${esc(state.error)}</div>` : ''}
    </main>`;
  app.innerHTML = app.innerHTML.replaceAll('CITATION REPAIR REGISTRY', 'CITATION REVIEW REGISTRY');
}

async function refreshRecords() {
  if (!state.contract) { state.records = []; return; }
  const ids = await read(state.contract, 'list_records');
  const records = [];
  for (const id of ids || []) {
    const record = await read(state.contract, 'get_record', [id]);
    const proposals = await read(state.contract, 'list_record_proposals', [id]);
    const challenges = state.productCompatible ? await read(state.contract, 'list_record_challenges', [id]) : [];
    records.push({ record, proposals: proposals || [], challenges: challenges || [] });
  }
  state.records = records;
}

async function refreshProbe() {
  if (!state.probeAddress) return;
  await verifyProbe(state.probeAddress);
  const result = await read(state.probeAddress, 'get_last_result');
  state.probeResult = result;
}

function probeMatchesPending(pending) {
  return state.probeResult?.result === 'MATCH'
    && state.probeResult?.revision_id === pending?.revision
    && state.probeResult?.quote === pending?.quote;
}

async function finishProbeDeployment(receipt) {
  const address = receipt?.txDataDecoded?.contractAddress || receipt?.to_address || receipt?.recipient;
  await verifyProbe(address);
  saveProbeAddress(address);
  state.probeAddress = address;
  state.probeResult = null;
  state.probeError = '';
}

async function finishProductDeployment(receipt) {
  const address = receipt?.txDataDecoded?.contractAddress || receipt?.to_address || receipt?.recipient;
  state.productConfig = await verifyProduct(address);
  state.productCompatible = true;
  saveProductAddress(address); state.contract = address;
}

async function loadState() {
  state.loading = true; state.recordsError = ''; state.contractError = ''; state.probeError = ''; render();
  const probeTask = refreshProbe().catch(error => { state.probeError = safeError(error); });
  const configTask = (async () => {
    if (!state.contract) { state.productConfig = null; state.productCompatible = false; return; }
    try {
      state.productConfig = await read(state.contract, 'get_config');
      state.productCompatible = state.productConfig?.product === 'ProofRelay'
        && state.productConfig?.criteria_version === PRODUCT_CRITERIA_VERSION
        && state.productConfig?.criteria_hash === PRODUCT_CRITERIA_HASH;
      const knownLegacy = state.productConfig?.product === 'ProofRelay'
        && ['proofrelay-scope-3', 'proofrelay-scope-4'].includes(state.productConfig?.criteria_version);
      if (!state.productCompatible && !knownLegacy) state.contractError = 'The address returned an unexpected product or policy version.';
    } catch (error) {
      state.productConfig = null; state.productCompatible = false; state.contractError = safeError(error);
    }
  })();
  await Promise.all([probeTask, configTask]);
  try { await refreshRecords(); }
  catch (error) { state.recordsError = safeError(error); }
  if (state.pending) {
    state.notice = `${state.pending.kind} is still pending. Check its saved transaction status.`;
  }
  state.loading = false;
  render();
}

async function submit(kind, send, afterFinalized, metadata = {}) {
  if (state.busy || state.pending) return;
  state.busy = true; state.error = ''; state.notice = `Preparing ${kind}…`; render();
  try {
    state.account = await requestWallet();
    const hash = await send(state.account);
    if (!/^0x[\da-fA-F]{64}$/.test(hash || '')) throw new Error('MetaMask did not return a valid transaction hash.');
    state.pending = { kind, hash, account: state.account, contract: state.contract, ...metadata };
    rememberPending(state.pending); state.notice = `${kind} submitted. Waiting for validator consensus…`; render();
    const receipt = await waitForFinality(hash, state.account);
    await afterFinalized(receipt);
    state.lastTx = hash; forgetPending(); state.pending = null;
    await refreshRecords(); state.notice = `${kind} finalized successfully.`;
  } catch (error) {
    if (state.pending && String(error?.message || error).includes(FINALIZED_EXECUTION_FAILURE)) {
      state.lastTx = state.pending.hash;
      forgetPending(); state.pending = null;
      state.error = '';
      state.notice = `${kind} finalized, but contract execution failed; no state change was applied.`;
    } else { state.error = safeError(error); state.notice = ''; }
  }
  finally { state.busy = false; render(); }
}

async function recoverPending() {
  const pending = state.pending;
  if (!pending || state.busy) return;
  state.busy = true; state.error = ''; state.notice = 'Checking the saved transaction status…'; render();
  try {
    // Some StudioNet write receipts cannot be decoded by older SDK versions even
    // after finality. The probe's exact stored state is authoritative for this
    // one-purpose gate, so recover from it before asking the SDK for a receipt.
    if (pending.kind === 'Source access probe') {
      await refreshProbe();
      if (probeMatchesPending(pending)) {
        state.lastTx = pending.hash; forgetPending(); state.pending = null;
        state.notice = 'Source access probe finalized MATCH.';
        return;
      }
    }
    const receipt = await waitForFinality(pending.hash, pending.account);
    if (pending.kind === 'Source probe deployment') await finishProbeDeployment(receipt);
    if (pending.kind === 'Source access probe') await refreshProbe();
    if (pending.kind === 'ProofRelay deployment') await finishProductDeployment(receipt);
    if (['Record creation', 'Correction proposal', 'Correction adoption', 'Evidence challenge'].includes(pending.kind)) await refreshRecords();
    state.lastTx = pending.hash; forgetPending(); state.pending = null; state.notice = `${pending.kind} finalized successfully.`;
  } catch (error) {
    if (String(error?.message || error).includes(FINALIZED_EXECUTION_FAILURE)) {
      state.lastTx = pending.hash;
      forgetPending(); state.pending = null;
      state.error = '';
      state.notice = `${pending.kind} finalized, but contract execution failed; no state change was applied.`;
    } else { state.error = safeError(error); state.notice = ''; }
  }
  finally { state.busy = false; render(); }
}

async function connect() {
  try { state.account = await requestWallet(); state.error = ''; }
  catch (error) { state.error = safeError(error); }
  render();
}

async function verifyAdoptionRequest(account, proposalId) {
  const proposal = await read(state.contract, 'get_proposal', [proposalId]);
  if (!proposal?.id) throw new Error('This correction proposal no longer exists.');
  const record = await read(state.contract, 'get_record', [proposal.record_id]);
  if (!record?.id) throw new Error('The proposal parent record no longer exists.');
  if (!sameAddress(account, record.owner)) throw new Error('Only the publisher wallet can adopt this correction.');
  if (proposal.adopted) throw new Error('This correction is already current.');
  if (proposal.outcome !== 'PRESERVES_SCOPE') throw new Error('Only a scope-preserving correction can be adopted.');
  if (proposal.base_revision !== record.current_revision) {
    throw new Error('This correction is stale and must be reviewed against the current citation.');
  }
}

app.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'connect') connect();
  if (button.dataset.action === 'deploy-probe') submit('Source probe deployment', deployProbe, finishProbeDeployment);
  if (button.dataset.action === 'inspect-probe') submit(
    'Source access probe',
    account => inspect(state.probeAddress, sampleRevision, sampleQuote, account),
    refreshProbe,
    { contract: state.probeAddress, revision: sampleRevision, quote: sampleQuote },
  );
  if (button.dataset.action === 'deploy') submit('ProofRelay deployment', deployProduct, finishProductDeployment);
  if (button.dataset.action === 'refresh') loadState();
  if (button.dataset.action === 'recover') recoverPending();
  if (button.dataset.action === 'adopt') {
    const proposalId = button.dataset.proposal;
    submit(
      'Correction adoption',
      async account => {
        await verifyAdoptionRequest(account, proposalId);
        return adoptCorrection(state.contract, proposalId, account);
      },
      refreshRecords,
      { proposalId },
    );
  }
});

app.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const values = new FormData(form);
  if (form.dataset.form === 'record') {
    const claim = String(values.get('claim') || '').trim();
    const revision = String(values.get('revision') || '').trim();
    const quote = String(values.get('quote') || '').trim();
    if (claim.length < 12 || claim.length > 400 || !CLAIM_SHAPE.test(claim)) {
      const field = form.elements.namedItem('claim');
      field.setCustomValidity('Enter one factual sentence ending in a period, without extra sentences or instructions.');
      field.reportValidity();
      field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
      return;
    }
    if (!/^\d{1,16}$/.test(revision)) { state.error = 'Revision ID must be 1–16 digits.'; return render(); }
    submit('Record creation', account => createRecord(state.contract, claim, revision, quote, account), refreshRecords, { claim, revision, quote });
  }
  if (form.dataset.form === 'correction') {
    const recordId = form.dataset.record;
    const revision = String(values.get('revision') || '').trim();
    const quote = String(values.get('quote') || '').trim();
    if (!/^\d{1,16}$/.test(revision)) { state.error = 'Revision ID must be 1–16 digits.'; return render(); }
    submit('Correction proposal', account => proposeCorrection(state.contract, recordId, revision, quote, account), refreshRecords, { recordId, revision, quote });
  }
  if (form.dataset.form === 'challenge') {
    const recordId = form.dataset.record;
    const revision = String(values.get('revision') || '').trim();
    const quote = String(values.get('quote') || '').trim();
    if (!/^\d{1,16}$/.test(revision)) { state.error = 'Revision ID must be 1–16 digits.'; return render(); }
    submit('Evidence challenge', account => submitChallenge(state.contract, recordId, revision, quote, account), refreshRecords, { recordId, revision, quote });
  }
});

render();
loadState();
