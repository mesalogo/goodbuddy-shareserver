"""Real Docs test; use an isolated stack. See docs/office-10-validation.md."""
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import zipfile

import httpx
import jwt
from playwright.sync_api import sync_playwright

from fixtures import docx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web', default='http://127.0.0.1:18088')
    parser.add_argument('--docs', default='http://127.0.0.1:18080')
    parser.add_argument('--plugin-port', type=int, default=18089)
    parser.add_argument('--browser', help='Optional Chromium executable path')
    parser.add_argument('--restart-container', help='Restart only this explicitly named test Office API container')
    args = parser.parse_args()
    secret = os.environ['ONLYOFFICE_JWT_SECRET']
    plugin_origin = f'http://127.0.0.1:{args.plugin_port}'
    fixtures = Path(__file__).parent / 'plugin'

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            name = urlsplit(self.path).path.removeprefix('/')
            if name not in ('config.json', 'index.html'):
                self.send_error(404)
                return
            content = (fixtures / name).read_text().replace('__DOCS_ORIGIN__', args.docs).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json' if name.endswith('.json') else 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', args.docs)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', args.plugin_port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with httpx.Client(base_url=args.web, timeout=10) as client, sync_playwright() as p:
            browser = p.chromium.launch(executable_path=args.browser, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            # The API/source/callback/save remain real. Only add the test plugin to
            # this browser's launch response, re-signing with the test stack secret.
            def configure(route):
                response = route.fetch()
                assert response.ok, response.status
                launch = response.json()
                config = launch['config']
                del config['token']
                config['editorConfig']['plugins'] = {
                    'autostart': ['asc.{C32D455A-5134-4E5C-A161-D919D9380010}'],
                    'pluginsData': [plugin_origin + '/config.json'],
                }
                config['token'] = jwt.encode(config, secret, algorithm='HS256')
                route.fulfill(json=launch)

            page.route('**/api/v1/office/documents/*/editor', configure)
            page.goto(args.web + '/documents')
            filename = f'gb-plugin-probe-{uuid.uuid4().hex[:8]}.docx'
            page.get_by_label('上传 DOCX', exact=True).set_input_files({
                'name': filename,
                'mimeType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'buffer': docx(),
            })
            row = page.get_by_role('listitem').filter(has=page.get_by_role('heading', name=filename, exact=True))
            row.get_by_role('link', name='打开编辑器', exact=True).click()
            document_id = page.url.split('document=')[1]
            path = f'/api/v1/office/documents/{document_id}'

            def wait_state(predicate):
                for _ in range(40):
                    try:
                        response = client.get(path)
                        response.raise_for_status()
                        state = response.json()
                        assert not state['error'], state
                        if predicate(state):
                            return state
                    except httpx.HTTPError:
                        pass
                    page.wait_for_timeout(500)
                raise AssertionError('Office state did not reach expected value')

            def saved_text():
                response = client.get(path + '/download')
                response.raise_for_status()
                with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                    return archive.read('word/document.xml').decode()

            def ready():
                for _ in range(80):
                    frame = next((f for f in page.frames if f.url.startswith(plugin_origin + '/index.html')), None)
                    if frame and frame.evaluate('window.probeReady === true'):
                        return frame
                    page.wait_for_timeout(500)
                raise AssertionError('Real ONLYOFFICE plugin did not initialize')

            plugin = ready()
            editor = page.frames[1]
            if editor.get_by_role('button', name='取消', exact=True).count():
                editor.get_by_role('button', name='取消', exact=True).click()
            page.mouse.click(650, 560)
            page.keyboard.press('Control+End')
            page.keyboard.type(' GB_UNSAVED_SELECTION_10', delay=30)
            page.keyboard.press('Control+Shift+Home')

            def selected():
                return plugin.evaluate("() => probeMethod('GetSelectedText', [{Numbering: false, Math: false}])")

            original = selected()
            assert 'original GB_UNSAVED_SELECTION_10' in original, repr(original)
            assert 'GB_UNSAVED_SELECTION_10' not in saved_text()
            print('PASS: plugin reads current unsaved selection', flush=True)
            # Narrow the selection to the last word. Preserve the unselected prefix.
            page.keyboard.press('Control+End')
            for _ in 'GB_UNSAVED_SELECTION_10':
                page.keyboard.press('Shift+ArrowLeft')
            selection = selected()
            assert selection.strip() == 'GB_UNSAVED_SELECTION_10', repr(selection)
            plugin.evaluate("() => probeMethod('PasteText', ['GB_PLUGIN_REPLACEMENT_10'])")
            page.keyboard.press('Control+a')
            assert selected().strip() == 'original GB_PLUGIN_REPLACEMENT_10'
            page.keyboard.press('Control+z')
            page.keyboard.press('Control+a')
            assert selected().strip() == original.strip()
            print('PASS: selected-range replacement preserves prefix; one undo restores original', flush=True)
            plugin.evaluate("() => probeMethod('PasteText', ['GB_PLUGIN_FINAL_10 中文修改'])")
            page.keyboard.press('Control+s')
            page.wait_for_timeout(2000)
            page.get_by_role('button', name='保存到服务器', exact=True).click()
            forced = wait_state(lambda s: s['revision'] >= 2 and s['state'] == 'editing')
            assert 'GB_PLUGIN_FINAL_10 中文修改' in saved_text()
            print('PASS: forcesave persists plugin Chinese text', json.dumps(forced), flush=True)
            page.get_by_role('link', name='关闭编辑器并返回文档库').click()
            final = wait_state(lambda s: s['state'] == 'saved')
            print('PASS: final callback', json.dumps(final), flush=True)
            if args.restart_container:
                subprocess.run(['docker', 'restart', args.restart_container], check=True, capture_output=True)
                wait_state(lambda s: s['state'] == 'saved')
                assert 'GB_PLUGIN_FINAL_10 中文修改' in saved_text()
                print('PASS: API restart preserves document', flush=True)
            page.goto(args.web + '/documents?document=' + document_id)
            plugin = ready()
            page.mouse.click(650, 560)
            page.keyboard.press('Control+a')
            assert selected().strip() == 'GB_PLUGIN_FINAL_10 中文修改'
            print('PASS: reopened editor contains persisted plugin text', flush=True)
            page.get_by_role('link', name='关闭编辑器并返回文档库').click()
            wait_state(lambda s: s['state'] == 'closed')
            print('PASS: close without changes ends session', flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == '__main__':
    main()
