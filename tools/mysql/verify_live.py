"""Read-only browser verification of the deployed release and session API."""
import argparse
import json
import os
import shutil

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--version', required=True)
args = parser.parse_args()
chrome = shutil.which('google-chrome') or shutil.which('chromium')
if not chrome:
    raise SystemExit('Chrome or Chromium must be installed for live verification.')
proxy_url = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome, args=['--no-sandbox'],
                                proxy={'server': proxy_url} if proxy_url else None)
    try:
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('https://littleboy.kesug.com/', wait_until='networkidle', timeout=60000)
        script = page.locator('script[src*="mysql-api-client.js"]')
        script.wait_for(timeout=15000)
        actual = script.get_attribute('src')
        if actual != 'mysql-api-client.js?v=' + args.version:
            raise RuntimeError('Live release version mismatch: ' + str(actual))
        result = page.evaluate('''async () => {
            const response = await fetch('/api/index.php?route=auth/session', {cache:'no-store'});
            const body = await response.json();
            return {status:response.status, error:body.error,
                    has_csrf:!!body.data?.csrf, signed_in:!!body.data?.session};
        }''')
        if result['status'] != 200 or result['error'] or not result['has_csrf'] or result['signed_in']:
            raise RuntimeError('Anonymous session API verification failed: ' + json.dumps(result))
        if errors:
            raise RuntimeError('Live page JavaScript errors: ' + json.dumps(errors))
        print(json.dumps({'release': args.version, 'anonymous_api': 'passed', 'javascript_errors': 0}))
    finally:
        browser.close()
