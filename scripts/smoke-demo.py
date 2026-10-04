#!/usr/bin/env python3
"""Smoke test for a running deployment. It uses the API the way the UI does and needs no packages.

Usage: scripts/smoke-demo.py [base-url]    (default http://localhost:8080)
"""
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)


def call(path, method="GET", body=None, key=None):
    """Returns (status, parsed JSON or raw bytes)."""
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Idempotency-Key"] = key
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with opener.open(request, timeout=10) as response:
            raw = response.read()
            is_json = raw and response.headers.get_content_type() == "application/json"
            return response.status, json.loads(raw) if is_json else raw
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def wait_until_healthy():
    for _ in range(60):
        try:
            if call("/actuator/health")[0] == 200:
                return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise SystemExit("The application did not become healthy within two minutes")


def snapshot(payout_id):
    return call(f"/api/v1/payouts/{payout_id}/snapshot")[1]


wait_until_healthy()

status, page = call("/")
assert status == 200 and b'id="root"' in page, "The packaged frontend is missing"
assert call("/api/v1/workspace", "POST")[0] == 200

intent = {
    "recipientReference": "smoke-seller",
    "amount": "100.00",
    "currency": "SGD",
    "provider": "simulated",
}
status, payout = call("/api/v1/payouts", "POST", intent, "smoke-payout")
assert status == 201, (status, payout)
payout_id = payout["id"]

# The network completes the payment but the reply is lost, so the payout is UNKNOWN.
outcome = {"outcome": "TIMEOUT_AFTER_SUCCESS"}
assert call(f"/api/v1/simulation/payouts/{payout_id}/next-outcome", "PUT", outcome)[0] == 204
assert call(f"/api/v1/payouts/{payout_id}/process", "POST")[1]["status"] == "UNKNOWN"
evidence = snapshot(payout_id)
assert evidence["provider"]["status"] == "SUCCEEDED" and evidence["ledger"] is None

# Reconciliation finds the payment and posts one journal of two entries.
assert call(f"/api/v1/payouts/{payout_id}/reconcile", "POST")[0] == 200
evidence = snapshot(payout_id)
assert evidence["payout"]["status"] == "SUCCEEDED"
assert len(evidence["ledger"]["entries"]) == 2

# The same idempotency key returns the same payout and creates no second one.
assert call("/api/v1/payouts", "POST", intent, "smoke-payout")[0] == 200
assert call("/api/v1/payouts")[1]["total"] == 1

print("Smoke test passed: frontend, workspace, lost response, reconciliation, idempotency.")
