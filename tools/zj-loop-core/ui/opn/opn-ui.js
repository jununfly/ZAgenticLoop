(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const field = (label, value) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
  async function api(path) { const response = await fetch(path, { credentials: 'same-origin' }); const body = await response.json(); if (!response.ok) throw new Error(body.reason || '读取失败'); return body; }
  async function refresh() {
    $('status').textContent = '读取中'; $('error').hidden = true;
    try {
      const [model, inbox, inbound, outbox, actions] = await Promise.all([api('/ui/connection'), api('/ui/inbox'), api('/ui/inbound-tasks'), api('/ui/outbox'), api('/ui/human-actions').catch(() => ({ requests: [] }))]);
      $('status').textContent = model.status === 'connected' ? '已连接' : model.status;
      $('summary').textContent = `${model.network_id} · ${model.peers.length} 个参与节点`;
      $('local').innerHTML = field('节点', model.local_node.node_id) + field('名称', model.local_node.display_name) + field('Agent', `${model.local_node.agent_kind} / ${model.local_node.agent_version}`);
      $('network').innerHTML = field('网络', model.network_id) + field('状态', model.status) + field('副作用', model.side_effects_executed ? '是' : '否');
      $('peers').innerHTML = model.peers.length ? model.peers.map((peer) => `<article class="peer"><div><strong>${esc(peer.node_id)}</strong><small>${esc(peer.endpoint)} · ${esc(peer.next_action)}</small></div><span class="peer-status">${esc(peer.status)}</span></article>`).join('') : '<article class="peer"><small>当前没有参与节点。</small></article>';
      $('inbox-status').textContent = `${inbox.messages.length} 条消息`;
      $('messages').innerHTML = inbox.messages.length ? inbox.messages.map((message) => `<article class="message"><div><strong>${esc(message.notification_kind)}</strong><small>${esc(message.from_node_id)} → ${esc(message.target_node_id)} · ${esc(message.task_id)}</small></div><span class="peer-status">${esc(message.delivery_state)}</span></article>`).join('') : '<article class="message"><small>当前没有消息。</small></article>';
      $('inbound-status').textContent = `${inbound.tasks.length} 条任务`;
      $('inbound-tasks').innerHTML = inbound.tasks.length ? inbound.tasks.map((task) => `<article class="message"><div><strong>${esc(task.envelope.task_id || task.inbound_id)}</strong><small>${esc(task.envelope.from_node_id)} → ${esc(task.envelope.target_node_id)} · ${esc(task.envelope.message_id)}</small><small>Artifact ${esc((task.envelope.artifact_refs || []).map((ref) => ref.artifact_id).join(', ') || 'none')}</small></div><span class="peer-status">${esc(task.status)}</span></article>`).join('') : '<article class="message"><small>当前没有待人工批准的入站任务。</small></article>';
      $('outbox-status').textContent = `${outbox.messages.length} 条消息`;
      $('outbox').innerHTML = outbox.messages.length ? outbox.messages.map((message) => `<article class="message"><div><strong>${esc(message.notification_kind)}</strong><small>${esc(message.from_node_id)} → ${esc(message.target_node_id)} · ${esc(message.task_id)}</small></div><span class="peer-status">已发送</span></article>`).join('') : '<article class="message"><small>当前没有已发送消息。</small></article>';
      $('actions-status').textContent = `${actions.requests.length} 条 action`;
      $('human-actions').innerHTML = actions.requests.length ? actions.requests.map((action) => `<article class="message"><div><strong>${esc(action.action_type)}</strong><small>${esc(action.requester_node_id)} · ${esc(action.reason)}</small><small>Evidence ${esc(action.evidence_refs?.length || 0)} · ${esc(action.request_id)}</small></div><span class="peer-status">${esc(action.status)}</span></article>`).join('') : '<article class="message"><small>当前没有 Human action。</small></article>';
    } catch (error) { $('status').textContent = '读取受阻'; $('error').textContent = error.message; $('error').hidden = false; }
  }
  $('refresh').addEventListener('click', refresh); refresh();
})();
