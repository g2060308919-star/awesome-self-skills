# TC-02 — Declared cleanup failure

- Observed at: 2026-08-30T11:45:58.051Z
- Source: Chrome DevTools delete click result and fresh post-navigation accessibility snapshot
- Cleanup target: `REQ-4001` only
- URL: `http://127.0.0.1:61570/ui/requests/REQ-4001/delete`
- Visible heading: `Cleanup failed`
- Visible alert: `Retention policy prevents deletion`
- Visible residual request: `REQ-4001`
- Cleanup result: failed
- Residual data: `REQ-4001`
- Next observation: return to the workspace once to verify the exact residual record remains; do not retry deletion.

