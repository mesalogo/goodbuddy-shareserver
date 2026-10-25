"""Isolated LAN-IP browser + real GoodBuddy DeviceSharingService verification.
Requires built ShareServer, adjacent goodbuddy sources, tsx and Python Playwright.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host', required=True)
parser.add_argument('--browser', required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
root = Path(tempfile.mkdtemp(prefix='device-registration-', dir=repo / 'data'))
api = f'http://{args.host}:18097'
web = f'http://{args.host}:18098'
env = dict(os.environ, DATABASE_URL=os.environ.get('PROBE_DATABASE_URL', ''), OFFICE_ENABLED='false', SHARESERVER_HOST='0.0.0.0',
           SHARESERVER_PORT='18097', SHARESERVER_API_PORT='18097', SHARESERVER_DATA_DIR=str(root / 'server'),
           SHARESERVER_AUTH_ENABLED='true', SHARESERVER_PUBLIC_URL=web)
processes = []
client_source = """
import { DeviceSharingService } from '../goodbuddy/src/main/device-sharing-service.ts';
const service = new DeviceSharingService(process.env.PROBE_SETTINGS, 'registration-probe');
await service.saveSettings({name:process.env.PROBE_NAME,serverUrl:process.env.PROBE_WEB});
const action=process.env.PROBE_ACTION;
const result=action==='register' ? await service.registerDevice() : action==='catalog' ? await service.getCatalog() :
 await service.publish({name:'probe resource',description:'isolated test',kind:'capability',sourceMode:'device',permissions:{search:false,read:false,download:false}});
console.log(JSON.stringify(result));
"""
def client(name, action):
    result = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e', client_source], cwd=repo,
                            env=dict(env, PROBE_SETTINGS=str(root / f'{name}.json'), PROBE_NAME=name,
                                     PROBE_ACTION=action, PROBE_WEB=web), capture_output=True, text=True, timeout=20)
    if result.returncode: raise RuntimeError(result.stderr)
    return json.loads(result.stdout)

try:
    with (root / 'services.log').open('w') as log:
        processes.append(subprocess.Popen(['node', 'dist/server/server/src/index.js'], cwd=repo, env=env, stdout=log, stderr=log))
        processes.append(subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', '--config', 'web/vite.config.ts', '--host', '0.0.0.0', '--port', '18098'], cwd=repo, env=env, stdout=log, stderr=log))
        for attempt in range(60):
            try:
                urllib.request.urlopen(api + '/api/v1/public/health', timeout=1).close()
                urllib.request.urlopen(web, timeout=1).close()
                break
            except Exception:
                if any(p.poll() is not None for p in processes): raise RuntimeError('Probe service exited')
                time.sleep(0.5)
        else: raise RuntimeError('Probe startup timed out')
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=args.browser, headless=True, args=['--no-sandbox'])
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(web + '/devices')
            page.get_by_label('初始化码', exact=True).fill((root / 'server/admin-setup-token').read_text())
            page.get_by_label('管理员账号', exact=True).fill('probe-admin')
            page.get_by_label('密码', exact=True).fill('isolated-probe-password')
            page.get_by_label('确认密码', exact=True).fill('isolated-probe-password')
            page.get_by_role('button', name='创建管理员并登录', exact=True).click()
            page.get_by_role('tab', name='注册设置', exact=True).click()
            mode = page.get_by_role('combobox', name='设备注册模式')
            assert mode.input_value() == 'open'
            assert client('automatic', 'register')['registrationStatus'] == 'approved'
            assert client('automatic', 'catalog')['registrationStatus'] == 'approved'
            client('automatic', 'publish')
            mode.select_option('approval')
            page.wait_for_function("document.querySelector('select').disabled === false")
            assert client('pending-device', 'register')['registrationStatus'] == 'pending'
            assert client('pending-device', 'catalog')['devices'] == []
            page.get_by_role('button', name='刷新注册状态').click()
            pending = page.locator('article').filter(has_text='pending-device')
            pending.get_by_role('button', name='批准接入').click()
            pending.get_by_text('pending-device · 已接纳', exact=True).wait_for()
            assert client('pending-device', 'catalog')['registrationStatus'] == 'approved'
            client('pending-device', 'publish')
            pending.get_by_role('button', name='停用设备').click()
            pending.get_by_text('pending-device · 已停用', exact=True).wait_for()
            assert client('pending-device', 'catalog')['registrationStatus'] == 'disabled'
            assert client('pending-device', 'register')['registrationStatus'] == 'disabled'
            assert client('rejected-device', 'register')['registrationStatus'] == 'pending'
            page.get_by_role('button', name='刷新注册状态').click()
            rejected = page.locator('article').filter(has_text='rejected-device')
            rejected.get_by_role('button', name='拒绝申请').click()
            rejected.get_by_text('rejected-device · 已拒绝', exact=True).wait_for()
            assert client('rejected-device', 'catalog')['registrationStatus'] == 'rejected'
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors, errors
            browser.close()
            print('PASS: IP browser admin setup/policy/approval/rejection/disable; real GB service register/catalog/publish; credentials reused across client processes; narrow layout and browser errors checked')
finally:
    for process in reversed(processes):
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
    shutil.rmtree(root)
