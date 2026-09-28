/* global document, window, localStorage, crypto */
(() => {
  const key = 'goodbuddy-workspace-demo-v1';
  const people = [{ id: 'lin', name: '林知远', job: '产品负责人' }, { id: 'zhang', name: '张明', job: '技术顾问' }, { id: 'chen', name: '陈悦', job: '产品设计师' }];
  const modes = { human: '本人处理', auto: '分身先处理', draft: '分身起草，本人确认' };
  const initial = () => ({ spaces: [
    { id: 'product', name: '产品设计', members: ['lin', 'zhang', 'chen'], modes: { lin: 'human', zhang: 'auto', chen: 'draft' }, messages: [] },
    { id: 'research', name: 'AI 应用研究', members: ['lin', 'zhang'], modes: { lin: 'human', zhang: 'human' }, messages: [] }
  ] });
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || initial(); } catch { return initial(); } };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const person = id => people.find(p => p.id === id);
  let data = read();
  let spaceId = data.spaces[0].id;
  let actor = 'lin';
  let recipient = '';
  let status = '';
  let draft = '';
  let contexts = [];
  let requireHuman = false;
  const current = () => data.spaces.find(s => s.id === spaceId);
  const options = (value) => Object.entries(modes).map(([id, label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join('');
  function save(next) {
    try { localStorage.setItem(key, JSON.stringify(next)); data = next; return true; }
    catch { status = '浏览器存储不可用，更改未保存。'; return false; }
  }
  const contextItems = () => [
    { id: 'brief', title: `${current().name} · 空间讨论摘要`, text: `空间：${current().name}\n目标：验证共享知识与数字分身协作的最小可用流程。\n待讨论：如何区分分身回复和本人的确认。` },
    { id: 'doc', title: '共享设置草稿 · 空间文档', text: '知识库与分身复用已授权资料。监督回顾的回答使用权限与原文查看权限分开设置。' }
  ];
  function render() {
    const space = current();
    document.querySelector('#app').innerHTML = `<div class="shell workspace-shell"><aside class="sidebar"><a class="brand" href="workspace.html"><span class="logo">g</span>GoodBuddy</a><div><div class="nav-label">当前组织</div><h3 style="margin-top:12px">明日工作室</h3><span class="badge">已加入 · 3 位成员</span></div><div><div class="panel-head"><span class="nav-label">共享工作空间</span><button data-create aria-label="新建工作空间">＋</button></div><nav class="space-nav">${data.spaces.map(s => `<button data-space="${s.id}" class="${s.id === spaceId ? 'active' : ''}"># ${escape(s.name)}</button>`).join('')}</nav></div><nav class="nav"><a href="index.html">个人共享主页 ↗</a><a href="settings.html">共享与分身设置 ↗</a></nav><div class="sidebar-bottom">组织内协作演示<br>消息不会发送给真实成员</div></aside><main><header class="topbar"><span class="crumb">明日工作室 / 共享工作空间</span><div class="workspace-toolbar"><label for="actor">模拟当前成员</label><select id="actor">${space.members.map(id => `<option value="${id}" ${actor === id ? 'selected' : ''}>${person(id).name}</option>`).join('')}</select><a href="settings.html">设置 ↗</a></div></header><div class="content workspace-content"><div class="workspace-mobile-nav"><select id="space-select" aria-label="切换工作空间">${data.spaces.map(s => `<option value="${s.id}" ${s.id === spaceId ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select><button data-create>新建空间</button></div><div class="heading"><div><div class="eyebrow">TEAM WORKSPACE</div><h1>${escape(space.name)}</h1><p>把问题交给具体的人，由本人或获准的数字分身接着处理。</p></div><button data-create>＋ 新建工作空间</button></div><div class="notice workspace-notice">当前以 ${person(actor).name} 的身份体验。切换成员可演示接收、确认草稿和本人接手；这是本地角色模拟，不是真实登录。</div><div class="workspace-layout"><div class="workspace-feed"><section aria-label="空间消息">${space.messages.length ? space.messages.map(thread).join('') : '<section class="panel empty"><h2>从一个明确的问题开始</h2><p>在下方 @ 一位空间成员，选择要附带的资料。消息和处理结果会留在这里。</p></section>'}</section>${composer()}</div><aside class="aside"><section class="panel"><h3>空间成员 · ${space.members.length}</h3><p>@ 指定真实成员，处理方式由接收者设置。</p><div class="workspace-members">${space.members.map(id => `<div class="workspace-member"><span class="mini-avatar">${person(id).name[0]}</span><div><strong>${person(id).name}${id === actor ? ' · 当前' : ''}</strong><span class="muted">${modes[space.modes[id] || 'human']}</span></div></div>`).join('')}</div></section><section class="panel"><h3>我在此空间的处理方式</h3><label class="field"><span>${person(actor).name} · 接收 @消息时</span><select id="mode">${options(space.modes[actor] || 'human')}</select></label><button id="save-mode">保存处理偏好</button><div class="notice">只影响后续消息。「需要本人确认」会优先进入本人待处理。新空间默认由本人处理。</div></section><section class="panel"><h3>空间知识与上下文</h3><p>本示例包含讨论摘要和共享设置草稿。发送时可预览并选择附带内容。</p><div class="notice">不会自动附带个人对话、私有知识库或监督记录。个人共享入口的公开范围不改变组织空间成员权限。</div><a href="index.html">查看个人共享知识库 ↗</a></section></aside></div><div class="workspace-status" role="status">${escape(status)}</div></div></main></div><dialog class="workspace-modal" id="create-dialog"><form id="create-form"><h2>新建共享工作空间</h2><label class="field"><span>所属组织</span><input type="text" value="明日工作室" disabled></label><label class="field"><span>空间名称</span><input id="space-name" type="text" required maxlength="40" placeholder="例如：客户交付讨论"></label><h3>加入空间的成员</h3><div class="context-options">${people.map(p => `<label class="check"><input type="checkbox" name="member" value="${p.id}" ${p.id === actor ? 'checked disabled' : 'checked'}>${p.name}${p.id === actor ? '（创建者）' : ''}</label>`).join('')}</div><p class="muted">成员立即加入仅为演示；真实邀请和组织管理尚未接入。</p><div class="footer-actions"><button type="button" id="cancel-create">取消</button><button class="primary">创建空间</button></div></form></dialog>`;
    bind();
  }
  function thread(message) {
    const mine = actor === message.to;
    const labels = { pending: '待本人处理', draft: '待本人确认草稿', replied: '分身已回复', handling: '本人已接手', done: '本人已回复' };
    return `<article class="thread" data-message="${message.id}"><div class="thread-head"><strong>${person(message.from).name} <span class="muted">→</span> @${person(message.to).name}</strong><span class="badge ${message.status === 'pending' || message.status === 'draft' ? 'gray' : ''}">${labels[message.status]}</span></div><div class="thread-body">${escape(message.text)}</div><div class="thread-context">${message.requireHuman ? '需要本人确认 · ' : ''}接收方式：${modes[message.mode]} · 附带 ${message.contexts.length} 项上下文</div>${message.contexts.length ? `<details><summary>查看发送时的上下文</summary>${message.contexts.map(c => `<h3>${escape(c.title)}</h3><div class="context-preview">${escape(c.text)}</div>`).join('')}</details>` : ''}${message.replies.map(r => `<div class="thread-reply"><h3>${person(message.to).name}${r.ai ? '的数字分身 · AI 示例回复' : ' · 本人（模拟）'}</h3><p>${escape(r.text)}</p></div>`).join('')}${message.status === 'draft' && mine ? `<div class="thread-reply"><h3>分身草稿 · 仅接收者可见</h3><label class="field"><span>确认前可编辑</span><textarea data-draft="${message.id}" maxlength="2000">${escape(message.draft)}</textarea></label><button data-confirm="${message.id}" class="primary">确认并发送</button></div>` : ''}${mine && message.status !== 'done' ? `<div class="thread-actions">${message.status !== 'handling' ? `<button data-takeover="${message.id}">由我接手</button>` : ''}</div>${message.status === 'handling' ? `<form data-reply="${message.id}"><label class="field"><span>本人回复</span><textarea required maxlength="2000" placeholder="输入你的处理意见"></textarea></label><button class="primary">发送本人回复</button></form>` : ''}` : ''}</article>`;
  }
  function composer() {
    return `<section class="panel workspace-composer"><h2>发起协作</h2><form id="send-form"><div class="recipient"><button type="button" id="mention-toggle">@ 选择成员</button><span id="recipient-label" class="badge gray">${recipient ? '@' + person(recipient).name : '尚未指定接收人'}</span></div><div class="mention-list" id="mention-list" hidden><input type="search" id="member-search" aria-label="搜索空间成员" placeholder="搜索成员姓名">${current().members.map(id => `<button type="button" data-recipient="${id}"><strong>@${person(id).name}</strong><span class="muted">${person(id).job}</span></button>`).join('')}<p id="no-members" hidden>没有匹配的空间成员</p></div><label class="field"><span>消息内容</span><textarea id="message-text" required maxlength="2000" placeholder="输入 @ 选择成员，例如：请评估这个方案的权限设计">${escape(draft)}</textarea></label><details><summary>选择附带上下文 · <span id="context-count">${contexts.length}</span> 项</summary><div class="context-options">${contextItems().map(c => `<label class="check"><input type="checkbox" data-context="${c.id}" ${contexts.includes(c.id) ? 'checked' : ''}><span>${escape(c.title)}<small>${escape(c.text)}</small></span></label>`).join('')}</div></details><label class="check" style="margin-top:18px"><input type="checkbox" id="require-human" ${requireHuman ? 'checked' : ''}><span>需要本人确认<small>此消息直接交给本人，不自动发布分身回复。</small></span></label><div class="footer-actions"><span class="muted">只发送给所选成员，线程对空间成员可见</span><button class="primary">发送消息</button></div></form></section>`;
  }
  function bind() {
    function switchSpace(id) { spaceId = id; if (!current().members.includes(actor)) actor = current().members[0]; recipient = ''; draft = ''; contexts = []; requireHuman = false; status = ''; render(); }
    document.querySelectorAll('[data-space]').forEach(el => el.onclick = () => switchSpace(el.dataset.space));
    document.querySelector('#space-select').onchange = e => switchSpace(e.target.value);
    document.querySelector('#actor').onchange = e => { actor = e.target.value; recipient = ''; draft = ''; contexts = []; requireHuman = false; render(); };
    document.querySelectorAll('[data-create]').forEach(el => el.onclick = () => document.querySelector('#create-dialog').showModal());
    document.querySelector('#cancel-create').onclick = () => document.querySelector('#create-dialog').close();
    document.querySelector('#create-form').onsubmit = e => {
      e.preventDefault(); const input = document.querySelector('#space-name'); const name = input.value.trim();
      if (!name || data.spaces.some(s => s.name === name)) { input.setCustomValidity('请输入不重复的空间名称'); input.reportValidity(); return; }
      const members = [...document.querySelectorAll('[name=member]:checked')].map(el => el.value);
      const id = crypto.randomUUID(); const next = read(); next.spaces.push({ id, name, members, modes: Object.fromEntries(members.map(id => [id, 'human'])), messages: [] });
      if (save(next)) switchSpace(id); else render();
    };
    document.querySelector('#space-name').oninput = e => e.target.setCustomValidity('');
    document.querySelector('#mention-toggle').onclick = () => { const list = document.querySelector('#mention-list'); list.hidden = !list.hidden; if (!list.hidden) document.querySelector('#member-search').focus(); };
    document.querySelector('#member-search').oninput = e => { let count = 0; document.querySelectorAll('[data-recipient]').forEach(el => { el.hidden = !el.textContent.includes(e.target.value.trim()); if (!el.hidden) count++; }); document.querySelector('#no-members').hidden = count > 0; };
    document.querySelectorAll('[data-recipient]').forEach(el => el.onclick = () => { recipient = el.dataset.recipient; document.querySelector('#recipient-label').textContent = '@' + person(recipient).name; document.querySelector('#mention-list').hidden = true; const input = document.querySelector('#message-text'); input.value = input.value.replace(/@$/, ''); draft = input.value; input.focus(); });
    document.querySelector('#message-text').oninput = e => { draft = e.target.value; if (draft.endsWith('@')) document.querySelector('#mention-list').hidden = false; };
    document.querySelectorAll('[data-context]').forEach(el => el.onchange = () => { contexts = [...document.querySelectorAll('[data-context]:checked')].map(el => el.dataset.context); document.querySelector('#context-count').textContent = contexts.length; });
    document.querySelector('#require-human').onchange = e => requireHuman = e.target.checked;
    document.querySelector('#save-mode').onclick = () => { const next = read(); next.spaces.find(s => s.id === spaceId).modes[actor] = document.querySelector('#mode').value; if (save(next)) status = '处理偏好已保存，仅影响后续消息。'; render(); };
    document.querySelector('#send-form').onsubmit = e => {
      e.preventDefault(); if (!recipient) { document.querySelector('#mention-list').hidden = false; document.querySelector('#member-search').focus(); return; }
      if (!draft.trim()) { document.querySelector('#message-text').focus(); return; }
      const next = read(); const space = next.spaces.find(s => s.id === spaceId); const mode = space.modes[recipient] || 'human';
      const attached = contextItems().filter(c => contexts.includes(c.id));
      const reply = attached.length ? `已收到问题。当前附带 ${attached.length} 项上下文，建议先核对资料授权范围，并明确标注分身回复与本人确认。具体方案仍需本人审阅。` : '已收到问题，但未附带具体资料。请补充需要评估的方案和验收条件，再进行具体判断。';
      const human = requireHuman || mode === 'human';
      space.messages.push({ id: crypto.randomUUID(), from: actor, to: recipient, text: draft.trim(), contexts: attached, requireHuman, mode, status: human ? 'pending' : mode === 'draft' ? 'draft' : 'replied', draft: !human && mode === 'draft' ? reply : '', replies: !human && mode === 'auto' ? [{ ai: true, text: reply }] : [] });
      if (save(next)) { draft = ''; contexts = []; recipient = ''; requireHuman = false; status = '消息已保存在当前演示空间。'; } render();
    };
    function update(id, change) { const next = read(); const message = next.spaces.find(s => s.id === spaceId).messages.find(m => m.id === id); if (message.to !== actor || message.status === 'done') return; change(message); save(next); render(); }
    document.querySelectorAll('[data-takeover]').forEach(el => el.onclick = () => update(el.dataset.takeover, m => { m.status = 'handling'; m.draft = ''; }));
    document.querySelectorAll('[data-confirm]').forEach(el => el.onclick = () => { const text = document.querySelector(`[data-draft="${el.dataset.confirm}"]`).value.trim(); if (text) update(el.dataset.confirm, m => { m.status = 'done'; m.replies.push({ ai: false, text }); m.draft = ''; }); });
    document.querySelectorAll('[data-reply]').forEach(el => el.onsubmit = e => { e.preventDefault(); const text = el.querySelector('textarea').value.trim(); if (text) update(el.dataset.reply, m => { m.status = 'done'; m.replies.push({ ai: false, text }); }); });
  }
  window.mountWorkspacePreferences = () => {
    data = read();
    const section = document.createElement('section'); section.className = 'panel workspace-preferences';
    section.innerHTML = `<div class="panel-head"><div><h2>组织工作空间 · 我的处理偏好</h2><p>明日工作室 / 林知远。与个人访客分身入口分别设置，以下偏好独立保存。</p></div><a href="workspace.html">进入协作空间 ↗</a></div>${data.spaces.filter(s => s.members.includes('lin')).map(s => `<label class="preference-row"><span>${escape(s.name)}</span><select data-space-mode="${s.id}">${options(s.modes.lin || 'human')}</select></label>`).join('')}<div class="notice">@ 指向你本人；可授权分身先回复或仅起草。对方要求本人确认时，优先交给你。更改仅影响后续消息。</div><div class="footer-actions"><span id="preferences-status" role="status"></span><button id="save-preferences">保存空间偏好</button></div>`;
    document.querySelector('.content').append(section);
    section.querySelector('#save-preferences').onclick = () => { const next = read(); section.querySelectorAll('[data-space-mode]').forEach(el => { const s = next.spaces.find(s => s.id === el.dataset.spaceMode); if (s?.members.includes('lin')) s.modes.lin = el.value; }); section.querySelector('#preferences-status').textContent = save(next) ? '空间偏好已保存' : status; };
  };
  if (document.body.dataset.page === 'workspace') render();
})();
