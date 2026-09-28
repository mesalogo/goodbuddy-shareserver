/* global structuredClone, console */
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5178/docs/demo/client/';
const key = 'goodbuddy-sharing-demo-v1';
const windows = [];
async function open(page, saved) {
  const dom = await JSDOM.fromURL(base + page, {
    resources: 'usable', runScripts: 'dangerously',
    beforeParse(window) {
      window.structuredClone = structuredClone;
      window.HTMLElement.prototype.scrollIntoView = function () {};
      if (saved) window.localStorage.setItem(key, saved);
    },
  });
  windows.push(dom.window);
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  return dom.window;
}
try {
  const owner = await open('settings.html');
  const d = owner.document;
  d.querySelector('[data-source=practice]').click();
  d.querySelector('[data-tab=avatar]').click();
  d.querySelector('[data-field=useReview]').click();
  d.querySelector('#save').click();
  const saved = owner.localStorage.getItem(key);
  const guest = await open('index.html', saved);
  const g = guest.document;
  assert.equal(g.querySelectorAll('[data-select]').length, 1);
  g.querySelector('[data-tab=avatar]').click();
  g.querySelectorAll('[data-ask]')[1].click();
  assert.match(g.querySelector('#messages').textContent, /原文未公开/);
  assert.equal(g.querySelector('details'), null);
  d.querySelector('[data-field=showOriginal]').click();
  d.querySelector('#save').click();
  const visible = await open('index.html', owner.localStorage.getItem(key));
  visible.document.querySelector('[data-tab=avatar]').click();
  assert.match(visible.document.querySelector('details').textContent, /回顾原文/);
  d.querySelector('[data-field=avatar]').click();
  d.querySelector('#save').click();
  const paused = await open('index.html', owner.localStorage.getItem(key));
  assert.equal(paused.document.querySelectorAll('[data-select]').length, 1);
  paused.document.querySelector('[data-tab=avatar]').click();
  assert.match(paused.document.body.textContent, /数字分身已暂停/);
  const config = JSON.parse(saved);
  config.knowledge = false;
  const revoked = await open('index.html', JSON.stringify(config));
  revoked.document.querySelector('[data-tab=avatar]').click();
  revoked.document.querySelector('[data-ask]').click();
  assert.match(revoked.document.querySelector('#messages').textContent, /资料不足/);
  config.scope = 'team';
  const team = await open('index.html', JSON.stringify(config));
  assert.match(team.document.body.textContent, /仅对团队成员开放/);
  assert.equal(team.document.querySelector('#chat-form'), null);
  console.log('PASS: source revocation, review privacy, original visibility, independent pause, team gate');
} finally {
  windows.forEach(window => window.close());
}
