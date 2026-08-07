(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const field = (label, value) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
  async function api(path) { const response = await fetch(path, { credentials: 'same-origin' }); const body = await response.json(); if (!response.ok) throw new Error(body.reason || '读取失败'); return body; }
  async function refresh() {
    $('status').textContent = '读取中'; $('error').hidden = true;
    try {
      const model = await api('/ui/connection');
      $('status').textContent = model.status === 'connected' ? '已连接' : model.status;
      $('summary').textContent = `${model.network_id} · ${model.peers.length} 个参与节点`;
      $('local').innerHTML = field('节点', model.local_node.node_id) + field('名称', model.local_node.display_name) + field('Agent', `${model.local_node.agent_kind} / ${model.local_node.agent_version}`);
      $('network').innerHTML = field('网络', model.network_id) + field('状态', model.status) + field('副作用', model.side_effects_executed ? '是' : '否');
      $('peers').innerHTML = model.peers.length ? model.peers.map((peer) => `<article class="peer"><div><strong>${esc(peer.node_id)}</strong><small>${esc(peer.endpoint)} · ${esc(peer.next_action)}</small></div><span class="peer-status">${esc(peer.status)}</span></article>`).join('') : '<article class="peer"><small>当前没有参与节点。</small></article>';
    } catch (error) { $('status').textContent = '读取受阻'; $('error').textContent = error.message; $('error').hidden = false; }
  }
  $('refresh').addEventListener('click', refresh); refresh();
})();
