/* global console, structuredClone */
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const key = 'goodbuddy-workspace-demo-v1';
const windows = [];
async function open(page, saved) {
  const dom = await JSDOM.fromURL('http://127.0.0.1:5178/docs/demo/client/' + page, {
    resources: 'usable', runScripts: 'dangerously',
    beforeParse(w) { w.structuredClone = structuredClone; if (saved) w.localStorage.setItem(key, saved); },
  });
  windows.push(dom.window);
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  return dom.window;
}
try {
  const w = await open('workspace.html');
  const d = w.document;
  const input = (selector, value, event = 'input') => { const el = d.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event(event, { bubbles: true })); };
  const submit = selector => d.querySelector(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const send = (to, human = false) => {
    input('#message-text', '@');
    assert.equal(d.querySelector('#mention-list').hidden, false);
    d.querySelector(`[data-recipient=${to}]`).click();
    input('#message-text', '请评估共享方案 <script>test</script>');
    d.querySelector('[data-context=doc]').click();
    if (human) d.querySelector('#require-human').click();
    submit('#send-form');
  };
  send('zhang');
  assert.match(d.querySelector('.thread').textContent, /分身已回复/);
  assert.equal(d.querySelector('.thread script'), null);
  assert.match(d.querySelector('.thread details').textContent, /原文查看权限/);
  send('chen');
  assert.equal(d.querySelector('[data-draft]'), null);
  input('#actor', 'chen', 'change');
  assert.ok(d.querySelector('[data-draft]'));
  input('[data-draft]', '已由本人确认，先验证权限流程。');
  d.querySelector('[data-confirm]').click();
  assert.match(d.querySelectorAll('.thread')[1].textContent, /已由本人确认/);
  input('#actor', 'lin', 'change');
  send('zhang', true);
  assert.match(d.querySelectorAll('.thread')[2].textContent, /待本人处理/);
  assert.equal(d.querySelectorAll('.thread')[2].querySelector('.thread-reply'), null);
  input('#actor', 'zhang', 'change');
  d.querySelectorAll('[data-takeover]')[0].click();
  input('[data-reply] textarea', '我已接手，补充本人意见。');
  submit('[data-reply]');
  assert.match(d.querySelector('.thread').textContent, /本人已回复/);
  assert.match(d.querySelector('.thread').textContent, /AI 示例回复/);
  d.querySelector('[data-space=research]').click();
  assert.equal(d.querySelectorAll('.thread').length, 0);
  input('#space-name', '新建交付空间');
  submit('#create-form');
  assert.match(d.querySelector('h1').textContent, /新建交付空间/);
  assert.equal(d.querySelector('#mode').value, 'human');
  const saved = w.localStorage.getItem(key);
  const settings = await open('settings.html', saved);
  const pref = settings.document.querySelector('[data-space-mode=product]');
  assert.ok(pref);
  pref.value = 'draft';
  settings.document.querySelector('#save-preferences').click();
  const restored = await open('workspace.html', settings.localStorage.getItem(key));
  assert.equal(restored.document.querySelector('#mode').value, 'draft');
  assert.equal(restored.document.querySelectorAll('.thread').length, 3);
  console.log('PASS: mention routing, context snapshot, private draft, confirmation override, human takeover, workspace isolation, creation, settings persistence');
} finally { windows.forEach(w => w.close()); }
