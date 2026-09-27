#!/usr/bin/env python3
"""Exercise the packaged UI and real payout API without third-party Python packages."""
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080').rstrip('/')
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path, method='GET', body=None, key=None):
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with client.open(req, timeout=10) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw and response.headers.get_content_type() == 'application/json' else raw
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

for attempt in range(60):
    try:
        if request('/actuator/health')[0] == 200:
            break
    except (OSError, ValueError):
        pass
    time.sleep(2)
else:
    raise SystemExit('Backend did not become healthy within two minutes')
status, html = request('/')
assert status == 200 and b'id="root"' in html, 'Packaged frontend is missing'
assert request('/api/v1/workspace', 'POST')[0] == 200
intent = {'recipientReference': 'smoke-seller', 'amount': '100.00', 'currency': 'SGD', 'provider': 'simulated'}
status, payout = request('/api/v1/payouts', 'POST', intent, 'smoke-payout')
assert status == 201, (status, payout)
id = payout['id']
assert request(f'/api/v1/simulation/payouts/{id}/next-outcome', 'PUT', {'outcome': 'TIMEOUT_AFTER_SUCCESS'})[0] == 204
assert request(f'/api/v1/payouts/{id}/process', 'POST')[1]['status'] == 'UNKNOWN'
_, evidence = request(f'/api/v1/payouts/{id}/snapshot')
assert evidence['provider']['status'] == 'SUCCEEDED' and evidence['ledger'] is None
assert request(f'/api/v1/payouts/{id}/reconcile', 'POST')[0] == 200
_, evidence = request(f'/api/v1/payouts/{id}/snapshot')
assert evidence['payout']['status'] == 'SUCCEEDED'
assert len(evidence['ledger']['entries']) == 2
assert request('/api/v1/payouts', 'POST', intent, 'smoke-payout')[0] == 200
assert request('/api/v1/payouts')[1]['total'] == 1
print('Packaged UI, isolated workspace, lost response, recovery and duplicate protection passed.')
