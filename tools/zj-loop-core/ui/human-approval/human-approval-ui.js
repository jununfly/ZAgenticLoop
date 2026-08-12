(() => {
  const state = { requests: [], actions: [], dogfoods: [], selected: null };
  const $ = (id) => document.getElementById(id);
  const status = $('connection-status');
  const list = $('request-list');
  const empty = $('empty-state');
  const error = $('error-state');
  const dialog = $('review-dialog');
  const message = $('dialog-message');
  const sessionToken = new URLSearchParams(window.location.search).get('session') || '';
  if (sessionToken) window.history.replaceState(null, '', window.location.pathname);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const api = async (path, options = {}) => { const target = new URL(path, window.location.href); if (sessionToken) target.searchParams.set('session', sessionToken); const headers = { ...(options.headers || {}), ...(sessionToken ? { 'x-zj-loop-ui-session': sessionToken } : {}) }; const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 10000); try { const response = await fetch(`${target.pathname}${target.search}`, { credentials: 'same-origin', ...options, headers, signal: controller.signal }); const body = await response.json(); if (!response.ok) throw new Error(body.reason || 'request-failed'); return body; } catch (reason) { if (reason?.name === 'AbortError') throw new Error('request-timeout'); throw reason; } finally { window.clearTimeout(timeout); } };
  function setStatus(text, kind) { status.textContent = text; status.className = `status status-${kind}`; }
  function renderIdentity(identity) { $('human-card').innerHTML = `<strong>Human signer</strong><span>${escapeHtml(identity.human_id)} · ${escapeHtml(identity.algorithm)}</span><div class="fingerprint">${escapeHtml(identity.public_key_fingerprint)}</div>`; }
  function render() {
    list.innerHTML = '';
    const pending = state.requests.filter((request) => request.status === 'pending');
    const byNode = new Map();
    pending.forEach((request) => byNode.set(request.node_id, [...(byNode.get(request.node_id) || []), request]));
    empty.hidden = pending.length !== 0;
    pending.forEach((request) => {
      const siblings = byNode.get(request.node_id) || [];
      const duplicate = siblings.length > 1;
      const card = document.createElement('article');
      card.className = 'request-card';
      card.innerHTML = `<h3>${escapeHtml(request.identity?.display_name || request.node_id)}</h3><p class="request-id">Request ID: <code>${escapeHtml(request.request_id)}</code></p><div class="request-meta"><span>${escapeHtml(request.identity?.agent_kind || 'Agent')}</span><span>node ${escapeHtml(request.node_id)}</span><span>${escapeHtml(request.endpoint || 'endpoint unavailable')}</span><span>expires ${escapeHtml(request.expires_at)}</span></div><div class="capability-list">${request.requested_capabilities.map((capability) => `<span class="capability">${escapeHtml(capability)}</span>`).join('')}</div>${duplicate ? `<p class="review-hint">${siblings.length} pending requests target this same node. Compare Request ID, capabilities, digest, and expiry; approve only the intended request.</p>` : ''}<p class="request-digest">Digest: <code>${escapeHtml(request.request_digest)}</code></p>`;
      card.addEventListener('click', () => openReview(request));
      list.append(card);
    });
    const actions = state.actions.filter((action) => action.status === 'pending');
    $('action-status').textContent = `${actions.length} pending`;
    $('action-empty').hidden = actions.length !== 0;
    $('action-list').innerHTML = actions.map((action) => `<article class="request-card action-card"><h3>${escapeHtml(action.action_type)}</h3><p>${escapeHtml(action.reason)}</p><div class="request-meta"><span>${escapeHtml(action.requester_node_id)}</span><span>expires ${escapeHtml(action.expires_at)}</span></div><dl class="action-context">${Object.entries(action.context || {}).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value))}</dd></div>`).join('')}</dl><p class="action-evidence">${action.evidence_refs?.length || 0} evidence reference(s)</p><div class="dialog-actions"><button class="button button-danger action-reject" data-request-id="${escapeHtml(action.request_id)}">Reject</button><button class="button button-primary action-approve" data-request-id="${escapeHtml(action.request_id)}">Approve</button></div></article>`).join('');
    const dogfoods = state.dogfoods.filter((request) => request.status === 'pending');
    $('dogfood-status').textContent = `${dogfoods.length} pending`;
    $('dogfood-empty').hidden = dogfoods.length !== 0;
    $('dogfood-list').innerHTML = dogfoods.map((request) => `<article class="request-card action-card"><h3>${escapeHtml(request.goal)}</h3><p>Execution ${escapeHtml(request.execution_id)} · ${escapeHtml(request.execution_mode)}</p><div class="request-meta"><span>${escapeHtml(request.dogfood_id)}</span><span>${escapeHtml(request.network_id)}</span></div><p>Allowed file: ${escapeHtml(request.allowed_files.join(', '))}</p><button class="button button-primary dogfood-approve" data-dogfood-id="${escapeHtml(request.dogfood_id)}">Approve with Keychain</button></article>`).join('');
  }
  function openReview(request) { state.selected = request; $('dialog-title').textContent = request.identity?.display_name || request.node_id; $('dialog-summary').innerHTML = [['Request ID', request.request_id], ['Node fingerprint', request.node_id], ['Agent kind', request.identity?.agent_kind || 'unknown'], ['Endpoint', request.endpoint || 'unknown'], ['Capabilities', request.requested_capabilities.join(', ')], ['Request digest', request.request_digest], ['Expires', request.expires_at]].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join(''); $('capability-list').innerHTML = request.requested_capabilities.map((capability) => `<label class="check"><input type="checkbox" value="${escapeHtml(capability)}" checked> ${escapeHtml(capability)}</label>`).join(''); message.textContent = ''; dialog.showModal(); }
  async function refresh() {
    error.hidden = true;
    const [sessionResult, requestsResult, actionsResult, dogfoodsResult, outboundTasksResult] = await Promise.allSettled([api('/ui/session'), api('/ui/pairing-requests'), api('/ui/human-actions'), api('/ui/dogfood-approvals'), api('/ui/outbound-task-approvals')]);
    if (sessionResult.status === 'rejected') {
      setStatus('Blocked', 'error');
      $('human-card').textContent = 'Local Gateway session unavailable. Refresh to reconnect.';
      error.hidden = false;
      error.textContent = sessionResult.reason?.message || 'session-unavailable';
      return;
    }
    renderIdentity(sessionResult.value.human);
    state.requests = requestsResult.status === 'fulfilled' ? requestsResult.value.requests : [];
    state.actions = actionsResult.status === 'fulfilled' ? actionsResult.value.requests : [];
    state.dogfoods = dogfoodsResult.status === 'fulfilled' ? dogfoodsResult.value.requests : [];
    state.outboundTasks = outboundTasksResult.status === 'fulfilled' ? outboundTasksResult.value.requests : [];
    render();
    const failures = [
      ['Pairing requests', requestsResult],
      ['Human actions', actionsResult],
      ['Graph dogfood', dogfoodsResult],
      ['Outbound Agent tasks', outboundTasksResult],
    ].filter(([, result]) => result.status === 'rejected');
    if (failures.length > 0) {
      setStatus('Partially connected', 'pending');
      error.hidden = false;
      error.textContent = failures.map(([label, result]) => `${label}: ${result.reason?.message || 'unavailable'}`).join(' · ');
    } else {
      setStatus('Ready', 'ok');
    }
  }
  state.outboundTasks = [];
  const renderOutboundTasks = () => {
    const pending = state.outboundTasks.filter((item) => item.status === 'pending');
    $('outbound-task-status').textContent = `${pending.length} pending`;
    $('outbound-task-empty').hidden = pending.length !== 0;
    $('outbound-task-error').hidden = true;
    $('outbound-task-list').innerHTML = pending.map((item) => {
      const task = item.envelope || {};
      const refs = (task.artifact_refs || []).map((ref) => ref.artifact_id).join(', ');
      return `<article class="request-card action-card"><h3>${escapeHtml(task.task_id || item.approval_id)}</h3><p>${escapeHtml(task.notification_kind || 'agent.task')} · target <code>${escapeHtml(task.target_node_id)}</code></p><dl class="action-context"><div><dt>Message</dt><dd>${escapeHtml(task.message_id)}</dd></div><div><dt>Artifact</dt><dd><code>${escapeHtml(refs || 'none')}</code></dd></div><div><dt>Expires</dt><dd>${escapeHtml(item.expires_at)}</dd></div><div><dt>Digest</dt><dd><code>${escapeHtml(item.envelope_digest)}</code></dd></div></dl><textarea class="outbound-note" data-approval-id="${escapeHtml(item.approval_id)}" rows="2" placeholder="Human review note (required)"></textarea><div class="dialog-actions"><button class="button button-danger outbound-reject" data-approval-id="${escapeHtml(item.approval_id)}">Reject</button><button class="button button-primary outbound-approve" data-approval-id="${escapeHtml(item.approval_id)}">Approve and publish</button></div></article>`;
    }).join('');
  };
  const originalRender = render;
  render = () => { originalRender(); renderOutboundTasks(); };
  $('refresh').addEventListener('click', refresh);
  $('approve').addEventListener('click', async () => { if (!state.selected) return; const approved = [...document.querySelectorAll('#capability-list input:checked')].map((input) => input.value); try { await api(`/ui/pairing-requests/${encodeURIComponent(state.selected.request_id)}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_digest: state.selected.request_digest, approved_capabilities: approved }) }); dialog.close(); await refresh(); } catch (reason) { message.textContent = reason.message; } });
  $('reject').addEventListener('click', async () => { if (!state.selected) return; const reason = window.prompt('Choose rejection reason: identity-untrusted, capability-too-broad, endpoint-unexpected, request-not-needed, duplicate-node, duplicate-request, human-review-deferred, other'); if (!reason) return; try { await api(`/ui/pairing-requests/${encodeURIComponent(state.selected.request_id)}/reject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_digest: state.selected.request_digest, reason }) }); dialog.close(); await refresh(); } catch (failure) { message.textContent = failure.message; } });
  $('action-list').addEventListener('click', async (event) => { const button = event.target.closest('button[data-request-id]'); if (!button) return; const action = state.actions.find((item) => item.request_id === button.dataset.requestId); if (!action) return; const decision = button.classList.contains('action-approve') ? 'approved' : 'rejected'; const reason = decision === 'approved' ? 'Reviewed the request and evidence.' : window.prompt('Reason for rejection'); if (!reason) return; button.disabled = true; try { await api(`/ui/human-actions/${encodeURIComponent(action.request_id)}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_digest: action.request_digest, decision, reason }) }); await refresh(); } catch (failure) { $('action-error').hidden = false; $('action-error').textContent = failure.message; button.disabled = false; } });
  $('dogfood-list').addEventListener('click', async (event) => { const button = event.target.closest('.dogfood-approve'); if (!button) return; const request = state.dogfoods.find((item) => item.dogfood_id === button.dataset.dogfoodId); if (!request) return; button.disabled = true; $('dogfood-error').hidden = true; $('dogfood-success').hidden = true; try { await api(`/ui/dogfood-approvals/${encodeURIComponent(request.dogfood_id)}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_digest: request.summary_digest }) }); await refresh(); $('dogfood-success').hidden = false; $('dogfood-success').textContent = `Approval recorded for ${request.dogfood_id}.`; } catch (failure) { $('dogfood-error').hidden = false; $('dogfood-error').textContent = failure.message; button.disabled = false; } });
  $('outbound-task-list').addEventListener('click', async (event) => { const button = event.target.closest('button[data-approval-id]'); if (!button) return; const approval = state.outboundTasks.find((item) => item.approval_id === button.dataset.approvalId); const note = document.querySelector(`textarea[data-approval-id="${CSS.escape(button.dataset.approvalId)}"]`)?.value.trim(); if (!approval || !note) { $('outbound-task-error').hidden = false; $('outbound-task-error').textContent = 'Human review note is required.'; return; } button.disabled = true; try { await api(`/ui/outbound-task-approvals/${encodeURIComponent(approval.approval_id)}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: button.classList.contains('outbound-approve') ? 'approved' : 'rejected', human_note: note }) }); await refresh(); } catch (failure) { $('outbound-task-error').hidden = false; $('outbound-task-error').textContent = failure.message; button.disabled = false; } });
  refresh();
})();
