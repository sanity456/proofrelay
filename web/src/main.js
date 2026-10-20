import './style.css';
import './pending-layout.css';
import {
  adoptCorrection, configuredProbeAddress, configuredProductAddress, createRecord, deployProduct,
  explorerAddress, explorerTx, forgetPending, pendingAction, proposeCorrection, read,
  PRODUCT_CRITERIA_HASH, PRODUCT_CRITERIA_VERSION, rememberPending, requestWallet, safeError, saveProductAddress, short, verifyProduct,
  waitForFinality,
} from './lib/chain.js';

const sampleRevision = '1380958329';
const sampleClaim = 'Apollo 11 landed in the Sea of Tranquility.';
const sampleQuote = 'landing in the Sea of Tranquility';
const CLAIM_SHAPE = /^[\p{L}\p{N} ,'()-]+\.$/u;
const FINALIZED_EXECUTION_FAILURE = 'This transaction did not finalize successfully. Check its explorer entry.';
const state = {
  account: '', probeAddress: configuredProbeAddress(), probeResult: null,
  contract: configuredProductAddress(), productConfig: null, productCompatible: false,
  records: [], pending: pendingAction(),
  busy: false, notice: '', error: '', lastTx: '',
};
const app = document.querySelector('#app');

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function statusClass(status = '') {
  return ['SUPPORTED', 'PRESERVES_SCOPE', 'MATCH'].includes(status) ? 'good' : 'bad';
}
function txLink(hash) { return hash ? `<a href="${explorerTx(hash)}" target="_blank" rel="noreferrer">Explorer ↗</a>` : ''; }
function sameAddress(left, right) { return Boolean(left && right) && left.toLowerCase() === right.toLowerCase(); }
function canOfferAdoption(record, proposal) {
  return state.productCompatible && proposal.outcome === 'PRESERVES_SCOPE' && !proposal.adopted
    && proposal.base_revision === record.current_revision
    && (!state.account || sameAddress(state.account, record.owner));
}

function renderRecords() {
  if (!state.contract) return '<p class="empty">Deploy the ProofRelay registry to start a record. This deployment sends 0 GEN; network fees may apply.</p>';
  if (!state.records.length) return `<p class="empty">${state.productCompatible ? 'No records yet. Create a supported claim using an exact quote from a permanent Wikipedia revision.' : 'This older QA deployment has no records. New writes are disabled.'}</p>`;
  return state.records.map(({ record, proposals }) => `
    <article class="record-card">
      <div class="record-top"><div><span class="step">${esc(record.id)} · ${esc(record.criteria_version)}</span><h3>${esc(record.claim)}</h3></div><span class="pill ${statusClass(record.current_outcome)}">${esc(record.current_outcome)}</span></div>
      <div class="evidence-pair"><div><small>ORIGINAL · IMMUTABLE</small><p>Revision ${esc(record.original_revision)}</p><blockquote>“${esc(record.original_quote)}”</blockquote></div><div><small>CURRENT CITATION</small><p>Revision ${esc(record.current_revision)}</p><blockquote>“${esc(record.current_quote)}”</blockquote></div></div>
      <div class="record-actions"><a href="https://en.wikipedia.org/w/index.php?oldid=${encodeURIComponent(record.current_revision)}" target="_blank" rel="noreferrer">Open current revision ↗</a>${state.productCompatible ? `<details><summary>Propose a citation repair</summary><form data-form="correction" data-record="${esc(record.id)}"><label>New permanent revision ID</label><input name="revision" inputmode="numeric" maxlength="16" placeholder="Wikipedia oldid" required /><label>Exact quote from its lead section</label><textarea name="quote" maxlength="600" rows="2" placeholder="Paste the exact sentence or passage" required></textarea><button class="primary" type="submit" ${state.busy || state.pending ? 'disabled' : ''}>Evaluate repair <span>↗</span></button></form></details>` : '<p class="field-note">Read-only: this record uses a legacy policy version. New proposals are disabled.</p>'}</div>
      <div class="proposal-list"><h4>Review history <span>${proposals.length}</span></h4>${proposals.length ? proposals.map(proposal => `
        <div class="proposal"><div class="proposal-top"><b>${esc(proposal.id)} · ${esc(proposal.outcome)}</b>${proposal.adopted ? '<span class="pill good">CURRENT</span>' : ''}</div><p>Candidate revision ${esc(proposal.candidate_revision)}</p><blockquote>“${esc(proposal.candidate_quote)}”</blockquote>${canOfferAdoption(record, proposal) ? `<button class="secondary" data-action="adopt" data-proposal="${esc(proposal.id)}" ${state.busy || state.pending ? 'disabled' : ''}>Adopt this repair</button>` : ''}</div>`).join('') : '<p class="empty">No correction proposals yet.</p>'}</div>
    </article>`).join('');
}

function render() {
  const pendingLabel = state.pending ? `${esc(state.pending.kind)} · ${esc(short(state.pending.hash))}` : '';
  app.innerHTML = `
    <main class="shell">
      <header class="topbar"><a class="brand" href="#" aria-label="ProofRelay home"><span class="mark">P</span><span>proof<span>relay</span></span></a><div class="top-meta"><span class="network-dot"></span><span>GENLAYER STUDIONET · 61999</span><button class="wallet" data-action="connect">${state.account ? esc(short(state.account)) : 'Connect wallet'}</button></div></header>
      <section class="hero product-hero"><div class="eyebrow">CITATION REPAIR REGISTRY · PROTOCOL ${state.productCompatible ? 'V3 QA' : state.contract ? 'OLDER QA READ-ONLY' : 'SETUP'}</div><h1>Keep the evidence.<br><em>Repair the citation.</em></h1><p class="lede">Freeze a factual claim and its permanent source passage. GenLayer validators independently check proposed citation fixes for the same scope and time before a publisher can adopt one.</p><div class="hero-proof"><div class="orb"><span>PR</span><i></i></div><div class="proof-label"><small>CONSENSUS OUTCOME</small><strong>${state.productCompatible ? 'Scope reviewed' : state.contract ? 'Read-only older deployment' : 'Evidence first'}</strong></div><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div></div></section>
      <section class="gate ${state.probeResult?.result === 'MATCH' ? 'gate-good' : ''}"><div><span class="step">01 / REQUIRED SOURCE PROBE</span><h2>${state.probeResult?.result === 'MATCH' ? 'Validator source access confirmed' : 'Network source probe'}</h2><p>${state.probeResult?.result === 'MATCH' ? `StudioNet finalized MATCH for Wikipedia revision ${esc(state.probeResult.revision_id)} and the exact passage “${esc(state.probeResult.quote)}”.` : 'The main contract follows the live source-access probe required by the project plan.'}</p></div>${state.probeAddress ? `<a href="${explorerAddress(state.probeAddress)}" target="_blank" rel="noreferrer">Probe contract ↗</a>` : '<span class="pill">Not linked in this browser</span>'}</section>
      <section class="panel setup-panel"><div class="panel-head"><div><div class="step">02 / PRODUCT CONTRACT</div><h2>${state.productCompatible ? 'ProofRelay v3 · QA deployment' : state.contract ? 'Older ProofRelay deployment · read-only' : 'ProofRelay v3 · QA deployment'}</h2></div><span class="badge">0 GEN value</span></div><p class="panel-copy">${state.productCompatible ? 'This v3 candidate is live for QA, not yet a public release. StudioNet finalized an honest record, an adversarial rollback, a scope-preserving correction and adoption, and a broader correction that remained unadopted. These cases do not prove general security.' : 'Older deployments remain read-only: v1 accepted an adversarial claim, and v2 rejected an ordinary factual claim. The locally tested v3 candidate can be deployed separately for live QA; only your wallet can approve it and the network fee.'}</p>${state.contract ? `<div class="contract-line"><span>${state.productCompatible ? `${PRODUCT_CRITERIA_VERSION} · ${PRODUCT_CRITERIA_HASH.slice(0, 12)}…` : `Older ${esc(state.productConfig?.criteria_version || 'unverified policy')}`}</span><a href="${explorerAddress(state.contract)}" target="_blank" rel="noreferrer">${esc(short(state.contract))} on explorer ↗</a></div>` : ''}${!state.productCompatible ? `<button class="secondary" data-action="deploy" ${state.busy || state.pending ? 'disabled' : ''}>Deploy separate v3 QA contract</button>` : ''}</section>
      <section class="workspace"><div class="workspace-heading"><div><div class="step">03 / PUBLIC EVIDENCE RECORDS</div><h2>Trace each citation change</h2><p>Only pinned Wikipedia lead sections are reviewed in this MVP. A validator consensus result is evidence support, not a guarantee that the claim is true.</p></div><button class="secondary" data-action="refresh" ${state.busy ? 'disabled' : ''}>Refresh records</button></div>
        ${state.productCompatible ? `<section class="panel create-panel"><div class="panel-head"><div><div class="step">NEW RECORD · INITIAL SUPPORT CHECK</div><h2>Freeze a supported claim</h2></div><span class="badge">No funds locked</span></div><form data-form="record"><label>One factual sentence <small>12–400 characters, ending in a period</small></label><textarea name="claim" maxlength="400" rows="2" required>${esc(sampleClaim)}</textarea><div class="form-grid"><div><label>Permanent Wikipedia revision ID</label><input name="revision" inputmode="numeric" maxlength="16" value="${sampleRevision}" required /></div><div><label>Exact source passage · up to 600 characters</label><textarea name="quote" maxlength="600" rows="2" required>${esc(sampleQuote)}</textarea></div></div><p class="field-note">The quote must occur verbatim in that revision’s lead section. Validators check whether the claim contains instructions and then judge support for the whole claim. The claim and original citation remain frozen.</p><button class="primary" type="submit" ${state.busy || state.pending ? 'disabled' : ''}>Create record <span>↗</span></button></form></section>` : state.contract ? '<section class="gate"><div><span class="step">WRITES PAUSED</span><h2>Older contract is read-only</h2><p>Older QA deployments failed a live test. Their records remain available for audit, but this app will not send further writes to them.</p></div></section>' : ''}
        <div class="records">${renderRecords()}</div>
      </section>
      <section class="three-up"><article><span>01</span><h3>Freeze the citation</h3><p>The original claim, quote and permanent revision stay visible after later repairs.</p></article><article><span>02</span><h3>Judge one correction</h3><p>Validators independently fetch both pinned sources, verify the exact quotes and compare a fixed outcome.</p></article><article><span>03</span><h3>Adopt only a safe repair</h3><p>Only the publisher can adopt a finalized PRESERVES_SCOPE result; other outcomes remain in the history.</p></article></section>
      <footer><span>ProofRelay · StudioNet · versioned fixed-scope criteria</span><span>Consensus records source support; it does not certify objective truth.</span></footer>
      ${state.pending ? `<div class="pending sticky-pending"><span class="spinner"></span><div><b>${pendingLabel}</b><small>Waiting for consensus and finality. This transaction is saved locally and can be checked again.</small></div><button data-action="recover" ${state.busy ? 'disabled' : ''}>Check status</button></div>` : ''}
      ${state.notice ? `<div class="notice toast">${esc(state.notice)} ${txLink(state.lastTx)}</div>` : ''}${state.error ? `<div class="error toast" role="alert">${esc(state.error)}</div>` : ''}
    </main>`;
}

async function refreshRecords() {
  if (!state.contract) { state.records = []; return; }
  const ids = await read(state.contract, 'list_records');
  const records = [];
  for (const id of ids || []) {
    const record = await read(state.contract, 'get_record', [id]);
    const proposals = await read(state.contract, 'list_record_proposals', [id]);
    records.push({ record, proposals: proposals || [] });
  }
  state.records = records;
}

async function refreshProbe() {
  if (!state.probeAddress) return;
  try {
    const result = await read(state.probeAddress, 'get_last_result');
    if (result?.result === 'MATCH') state.probeResult = result;
  } catch { /* A missing or stale probe does not prevent the UI from loading. */ }
}

async function finishProductDeployment(receipt) {
  const address = receipt?.txDataDecoded?.contractAddress || receipt?.to_address || receipt?.recipient;
  state.productConfig = await verifyProduct(address);
  state.productCompatible = true;
  saveProductAddress(address); state.contract = address;
}

async function loadState() {
  await refreshProbe();
  if (state.contract) {
    try {
      state.productConfig = await read(state.contract, 'get_config');
      state.productCompatible = state.productConfig?.product === 'ProofRelay'
        && state.productConfig?.criteria_version === PRODUCT_CRITERIA_VERSION
        && state.productConfig?.criteria_hash === PRODUCT_CRITERIA_HASH;
    } catch {
      state.productConfig = null;
      state.productCompatible = false;
    }
  }
  await refreshRecords();
  if (state.pending) {
    state.notice = `${state.pending.kind} is still pending. Check its saved transaction status.`;
  }
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
    const receipt = await waitForFinality(pending.hash, pending.account);
    if (pending.kind === 'ProofRelay deployment') await finishProductDeployment(receipt);
    if (pending.kind === 'Record creation' || pending.kind === 'Correction proposal' || pending.kind === 'Correction adoption') await refreshRecords();
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
  if (button.dataset.action === 'deploy') submit('ProofRelay deployment', deployProduct, finishProductDeployment);
  if (button.dataset.action === 'refresh') loadState().catch(error => { state.error = safeError(error); render(); });
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
});

loadState().catch(error => { state.error = safeError(error); render(); });
