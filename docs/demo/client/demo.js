/* global document, window, localStorage, structuredClone, clearTimeout, setTimeout */
const key = 'goodbuddy-sharing-demo-v1';
const defaults = { knowledge: true, avatar: true, name: '林知远', scope: 'link', sources: ['practice', 'product'], useKnowledge: true, useReview: false, showOriginal: false, prompt: '以技术顾问的身份交流，先给出判断，再解释依据。资料不足时明确说明，不替本人承诺报价和交付时间。' };
const sources = [
  { id: 'practice', name: 'AI 应用实践', meta: '12 篇资料 · 今天更新', desc: '从原型到落地，记录真实项目中的设计取舍。', title: '让 AI 应用从一个小场景开始', body: '<p>一个值得先做的场景，通常有清晰的输入、可检查的输出，以及愿意持续使用它的人。</p><h3>先确定怎样算完成</h3><p>在接入模型之前，先写下验收条件。以资料问答为例，除了能回答问题，还应能指出依据，并在资料不足时说明不知道。</p><h3>把反馈留在工作流里</h3><p>先让小范围用户完成一次真实任务，记录哪里需要人工补充，再决定是否扩大自动化范围。</p>' },
  { id: 'product', name: '产品设计笔记', meta: '8 篇资料 · 昨天更新', desc: '围绕权限、知识共享和人机协作的产品思考。', title: '知识共享与数字分身的关系', body: '<p>知识库可以独立共享，也可以作为数字分身的回答来源。同一份资料只需维护一次。</p><h3>内容复用，授权明确</h3><p>关联知识库时，需要确认这些资料能否向分身的访问者提供。团队内资料不会因为关联一个公开分身就自动公开。</p><h3>阅读资料与交流分开</h3><p>访问者可以直接阅读共享知识，也可以向分身提问。监督回顾可用于帮助分身理解个人偏好，但原始记录是否可见需要单独设置。</p>' }
];
let state = load();
let tab = 'knowledge';
let selected = 'practice';
let dirty = false;
let toastTimer;
const settings = document.body.dataset.page === 'settings';
const app = document.querySelector('#app');
function load() { try { return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem(key) || 'null') }; } catch { return structuredClone(defaults); } }
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function toast(text) { document.querySelector('.toast')?.remove(); clearTimeout(toastTimer); const node = document.createElement('div'); node.className = 'toast'; node.setAttribute('role', 'status'); node.textContent = text; document.body.append(node); toastTimer = setTimeout(() => node.remove(), 3500); }
function toggle(field, title, desc) { return `<label class="row"><span><strong>${title}</strong><p>${desc}</p></span><input class="switch" type="checkbox" data-field="${field}" ${state[field] ? 'checked' : ''} aria-label="${title}"></label>`; }
function render() {
  app.innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="index.html"><span class="logo">g</span>GoodBuddy</a><div><div class="nav-label">${settings ? '偏好设置' : '共享空间'}</div><nav class="nav"><a href="index.html" class="${!settings ? 'active' : ''}">共享主页</a><a href="settings.html" class="${settings ? 'active' : ''}">共享设置</a></nav></div><div class="sidebar-bottom"><div class="account"><span class="mini-avatar">林</span><div>林知远<div class="muted">个人工作空间</div></div></div>交互原型 / CLIENT 01<br>所有资料与回答均为演示数据</div></aside><main><header class="topbar"><div><span class="mobile-brand">GoodBuddy · </span><span class="crumb">${settings ? '设置 / 共享与数字分身' : '个人空间 / 对外共享'}</span></div><a href="${settings ? 'index.html' : 'settings.html'}">${settings ? '查看访客页面 ↗' : '管理共享设置 ↗'}</a></header><div class="content">${settings ? settingsView() : visitorView()}</div></main></div>`;
  bind();
  const workspaceLink = document.createElement('a');
  workspaceLink.href = 'workspace.html';
  workspaceLink.textContent = '组织工作空间 ↗';
  document.querySelector('.topbar').append(workspaceLink);
  if (settings) window.mountWorkspacePreferences?.();
}
function settingsView() {
  return `<div class="heading"><div><div class="eyebrow">SHARING & IDENTITY</div><h1>把知识分享出去，让分身参与交流</h1><p>选择愿意分享的内容，设置别人可以怎样与你的数字分身交流。</p></div><span class="badge gray">客户端设置演示</span></div><div class="tabs" role="tablist" aria-label="共享设置类别"><button class="tab ${tab === 'knowledge' ? 'active' : ''}" role="tab" aria-selected="${tab === 'knowledge'}" data-tab="knowledge">共享知识库</button><button class="tab ${tab === 'avatar' ? 'active' : ''}" role="tab" aria-selected="${tab === 'avatar'}" data-tab="avatar">数字分身</button></div><div class="columns"><div>${tab === 'knowledge' ? knowledgeSettings() : avatarSettings()}<section class="panel"><div class="panel-head"><div><h2>访问范围</h2><p>本演示中的知识库与分身使用同一个共享空间和访问范围。</p></div></div><label class="field"><span>谁可以访问</span><select data-field="scope"><option value="link" ${state.scope === 'link' ? 'selected' : ''}>持有链接的人</option><option value="team" ${state.scope === 'team' ? 'selected' : ''}>仅团队成员</option></select></label><p class="muted">团队模式下，匿名访客页面将显示访问限制。真实身份校验尚未接入。</p></section><div class="footer-actions"><span id="save-state" class="save-state" role="status">${dirty ? '有未保存的更改' : '当前为已保存的演示配置'}</span><div><button id="reset">恢复示例</button> <button class="primary" id="save">保存设置</button></div></div></div><aside class="aside"><section class="panel"><div class="eyebrow">共享关系</div><div class="flow"><div><strong>01 / 选择资料</strong><p>维护一份知识内容，选择对外共享的知识库。</p></div><div><strong>02 / 关联分身</strong><p>分身复用已授权的共享知识，再叠加个人设定。</p></div><div><strong>03 / 独立控制入口</strong><p>暂停分身后，知识库仍可共享。撤销知识共享后，分身也停止使用这些资料。</p></div></div></section><section class="panel"><h3>当前配置</h3><div class="summary-line"><span>共享知识库</span><strong>${state.knowledge ? state.sources.length + ' 个' : '已暂停'}</strong></div><div class="summary-line"><span>数字分身</span><strong>${state.avatar ? '已开启' : '已暂停'}</strong></div><div class="summary-line"><span>监督回顾</span><strong>${state.useReview ? '已选 1 条' : '未授权'}</strong></div><div class="notice">保存仅写入本浏览器，不会发布真实资料或修改 GoodBuddy 设置。</div></section></aside></div>`;
}
function knowledgeSettings() {
  return `<section class="panel"><h2>共享知识库</h2>${toggle('knowledge', '开启知识共享', '允许访问者阅读选中的示例资料，供数字分身复用。')}</section><section class="panel"><div class="panel-head"><div><h2>选择共享内容</h2><p>仅选中的知识库对访问者开放。</p></div><span class="badge gray">本地知识库</span></div>${sources.map(s => `<label class="row check"><input type="checkbox" data-source="${s.id}" ${state.sources.includes(s.id) ? 'checked' : ''}><span><strong>${s.name}</strong><small>${s.meta}</small><small>${s.desc}</small></span></label>`).join('')}<div class="row"><span><strong>客户项目档案</strong><p>私人资料 · 未纳入本次共享</p></span><span class="badge gray">保持私有</span></div><div class="notice">取消选择或暂停知识共享后，分身将同步失去这些知识来源。数字分身开关不受影响。</div></section>`;
}
function avatarSettings() {
  return `<section class="panel"><h2>数字分身</h2>${toggle('avatar', '开启我的数字分身', '为共享空间增加对话入口，使用你授权的资料与个人设定。')}</section><section class="panel"><h2>身份与表达</h2><p style="margin-bottom:18px">访问者会明确看到这是 AI 分身。</p><label class="field"><span>显示名称</span><input type="text" maxlength="30" data-field="name" value="${esc(state.name)}"></label><label class="field"><span>自定义提示词</span><textarea data-field="prompt" maxlength="2000">${esc(state.prompt)}</textarea></label></section><section class="panel"><h2>回答可以参考什么</h2>${toggle('useKnowledge', '关联共享知识库', `复用已授权的知识库。当前${state.knowledge ? '选中 ' + state.sources.length + ' 个' : '知识共享已暂停，暂不可用'}。`)}${toggle('useReview', '共享选定的监督回顾', '仅授权下方这一条示例回顾，不包含全部信息流或后续新记录。')}<details ${state.useReview ? 'open' : ''}><summary>查看待授权的回顾内容</summary><div class="record">示例回顾 · 09 月 24 日<br>讨论产品方案时，倾向于先确定一个可验证的小场景，再扩大范围；关注权限边界和用户能否理解操作结果。</div></details>${toggle('showOriginal', '允许访客查看回顾原文', '独立于回答参考权限；需先开启上方监督回顾授权。')}<div class="notice">默认不共享监督回顾。授权用于回答，并不自动允许访问者阅读原始记录。</div></section>`;
}
function visitorView() {
  return `<div class="heading"><div class="profile"><div class="avatar">${esc(state.name.slice(0, 1) || '林')}</div><div><div class="eyebrow">PERSONAL KNOWLEDGE SPACE</div><h1>${esc(state.name || '我的')}的共享空间</h1><p>分享 AI 应用实践与产品思考，也欢迎和我的数字分身聊聊。</p></div></div><span class="badge gray">访客视角 · 演示</span></div>${state.scope === 'team' ? '<section class="panel empty"><h2>这个空间仅对团队成员开放</h2><p>当前模拟的是匿名访问者。请在共享设置中切换为「持有链接的人」，体验公开访问流程。</p><a href="settings.html">前往共享设置 →</a></section>' : `<div class="tabs" role="tablist" aria-label="共享内容"><button role="tab" aria-selected="${tab === 'knowledge'}" class="tab ${tab === 'knowledge' ? 'active' : ''}" data-tab="knowledge">知识库 <span class="muted">${state.knowledge ? state.sources.length : 0}</span></button><button role="tab" aria-selected="${tab === 'avatar'}" class="tab ${tab === 'avatar' ? 'active' : ''}" data-tab="avatar">与分身交流</button></div>${tab === 'knowledge' ? knowledgeVisitor() : avatarVisitor()}`}<p class="muted" style="margin-top:22px">交互演示：配置仅保存在当前浏览器；对话使用固定示例逻辑，未连接模型、知识检索或真实共享服务。</p>`;
}
function knowledgeVisitor() {
  const available = sources.filter(s => state.sources.includes(s.id));
  if (!state.knowledge || !available.length) return '<section class="panel empty"><h2>暂无开放的知识库</h2><p>主人已暂停知识共享，或尚未选择资料。数字分身可以独立开启。</p></section>';
  const item = available.find(s => s.id === selected) || available[0];
  selected = item.id;
  return `<div class="split"><section><label class="field"><span>查找共享知识库</span><input id="search" type="search" placeholder="搜索名称或简介"></label><div class="source-list">${available.map(s => `<button class="source ${s.id === selected ? 'active' : ''}" data-select="${s.id}" aria-pressed="${s.id === selected}"><div class="source-icon">KNOWLEDGE / ${s.id === 'practice' ? '01' : '02'}</div><strong>${s.name}</strong><small>${s.desc}<br>${s.meta}</small></button>`).join('')}</div><p id="no-results" hidden>没有匹配的知识库。</p></section><section class="panel reader"><div class="panel-head"><span class="badge">已授权共享</span><span class="muted">资料节选 / 示例</span></div><h2>${item.title}</h2><p>来自 ${item.name} · 林知远</p><article>${item.body}</article><div class="row"><span class="muted">${state.avatar && state.useKnowledge ? '这份资料也用于数字分身回答' : '以共享资料形式提供阅读'}</span>${state.avatar ? '<button data-tab="avatar">向分身提问 ↗</button>' : ''}</div></section></div>`;
}
function avatarVisitor() {
  if (!state.avatar) return '<section class="panel empty"><h2>数字分身已暂停</h2><p>暂时无法发起对话。已开放的共享知识库仍可阅读。</p><button data-tab="knowledge">浏览知识库</button></section>';
  const available = state.knowledge && state.useKnowledge ? sources.filter(s => state.sources.includes(s.id)) : [];
  return `<div class="columns"><section class="panel chat"><div class="panel-head"><div><h2>${esc(state.name || '我的')}的数字分身</h2><p>AI 分身 · 回答不代表本人承诺</p></div><span class="badge">可交流</span></div><div class="suggestions"><button data-ask="如何开始一个 AI 应用项目？">如何开始一个 AI 项目？</button><button data-ask="你通常怎样做产品决策？">你怎样做产品决策？</button></div><div class="messages" id="messages" role="log" aria-live="polite"><div class="message">你好，我可以根据主人授权的共享资料，与你交流 AI 应用和产品设计。你想从哪里开始？<small>固定示例回复，不是实时模型输出</small></div></div><form class="composer" id="chat-form"><input type="text" id="question" maxlength="500" required aria-label="向数字分身提问" placeholder="输入你的问题…"><button class="primary">发送</button></form></section><aside class="aside"><section class="panel"><h3>这次交流的知识来源</h3>${available.length ? available.map(s => `<div class="row"><span>${s.name}</span><span class="badge gray">已关联</span></div>`).join('') : '<p>当前未关联可用的共享知识库。</p>'}<div class="row"><span>监督回顾</span><span class="badge gray">${state.useReview ? '已授权 1 条' : '未共享'}</span></div>${state.useReview && state.showOriginal ? '<details><summary>查看获准公开的回顾原文</summary><div class="record">讨论产品方案时，倾向于先确定一个可验证的小场景，再扩大范围；关注权限边界和用户能否理解操作结果。</div></details>' : ''}<div class="notice">分身只能使用主人明确授权的内容。无法访问未共享的知识库和私人对话。</div></section><section class="panel"><h3>关于这个分身</h3><p>知识库提供资料依据，选定的回顾补充决策习惯，个人提示词设定表达方式。</p><p style="margin-top:12px">此原型仅演示来源开关，不执行自定义提示词。</p></section></aside></div>`;
}
function answer(question) {
  const messages = document.querySelector('#messages');
  const user = document.createElement('div'); user.className = 'message user'; user.textContent = question; messages.append(user);
  const available = state.knowledge && state.useKnowledge ? state.sources : [];
  let text = '目前授权的示例资料不足以回答这个问题。你可以询问 AI 项目起步或产品决策；具体承诺需要联系本人确认。';
  let citation = '未使用资料 · 演示回复';
  if (/决策|习惯/.test(question) && state.useReview) { text = '从这条已授权的回顾来看，主人倾向于先确定一个可验证的小场景，再扩大范围；同时关注权限边界和用户对操作结果的理解。'; citation = '参考：已授权监督回顾 · 09 月 24 日' + (state.showOriginal ? ' · 原文可在右侧查看' : ' · 原文未公开'); }
  else if (/AI|项目|开始/i.test(question) && available.includes('practice')) { text = '可以先选一个输入清晰、输出可检查的小场景，写下验收条件，再邀请少量用户完成真实任务。对于资料问答，建议先验证回答是否有出处，以及资料不足时能否明确说明。'; citation = '来源：AI 应用实践 / 让 AI 应用从一个小场景开始'; }
  else if (/产品|共享|知识库|分身/.test(question) && available.includes('product')) { text = '知识库和数字分身可以复用同一份资料，但要明确使用权限。知识库独立提供阅读，分身在授权范围内参考资料；监督回顾的回答权限与原文查看权限应分开控制。'; citation = '来源：产品设计笔记 / 知识共享与数字分身的关系'; }
  const reply = document.createElement('div'); reply.className = 'message'; reply.textContent = text; const foot = document.createElement('small'); foot.textContent = citation + ' · 固定示例'; reply.append(foot); messages.append(reply); reply.scrollIntoView({ block: 'nearest' });
}
function bind() {
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { tab = el.dataset.tab; render(); document.querySelector(`.tab[data-tab="${tab}"]`)?.focus(); }));
  document.querySelectorAll('[data-field]').forEach(el => el.addEventListener('input', () => { state[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value; dirty = true; if (el.type === 'checkbox' || el.tagName === 'SELECT') render(); else document.querySelector('#save-state').textContent = '有未保存的更改'; }));
  document.querySelectorAll('[data-source]').forEach(el => el.addEventListener('change', () => { state.sources = el.checked ? [...state.sources, el.dataset.source] : state.sources.filter(id => id !== el.dataset.source); dirty = true; render(); }));
  document.querySelector('#save')?.addEventListener('click', () => { if (!state.name.trim()) { toast('请填写分身显示名称'); return; } try { localStorage.setItem(key, JSON.stringify(state)); dirty = false; render(); toast('已保存演示配置，可打开访客页面查看'); } catch { toast('浏览器不允许本地存储，设置未保存'); } });
  document.querySelector('#reset')?.addEventListener('click', () => { state = structuredClone(defaults); dirty = true; render(); toast('已恢复示例，保存后生效'); });
  document.querySelectorAll('[data-select]').forEach(el => el.addEventListener('click', () => { selected = el.dataset.select; render(); }));
  document.querySelector('#search')?.addEventListener('input', event => { const q = event.target.value.trim().toLowerCase(); let count = 0; document.querySelectorAll('[data-select]').forEach(el => { el.hidden = !el.textContent.toLowerCase().includes(q); if (!el.hidden) count++; }); document.querySelector('#no-results').hidden = count > 0; });
  document.querySelector('#chat-form')?.addEventListener('submit', event => { event.preventDefault(); const input = document.querySelector('#question'); if (input.value.trim()) answer(input.value.trim()); input.value = ''; });
  document.querySelectorAll('[data-ask]').forEach(el => el.addEventListener('click', () => answer(el.dataset.ask)));
}
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => { if (event.key === key && !dirty) { state = load(); render(); } });
render();
