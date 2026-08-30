# TC-08-S1 — Authorized deletion and preservation verification

- Observed at: 2026-08-30T12:36:48.367Z
- Source: Chrome DevTools delete click result and fresh post-navigation accessibility snapshot of the full Requests table
- Mutation performed: clicked `Delete REQ-9001` exactly once
- Bulk action: none
- REQ-9002 mutation: none
- Visible confirmation: `Request deleted`
- Authorized target verification: `REQ-9001` is absent from the complete visible Requests list
- Protected record verification: `REQ-9002` remains visible as `Stale sandbox request`, `$125.00`, `Draft`
- Other visible records preserved: `REQ-1001`, `REQ-1003`, `REQ-2002`, `REQ-2010`, `REQ-4001`, `REQ-9003`
- TC-08-S1-A1 outcome: `verified-pass`
- TC-08-S1-A2 outcome: `verified-pass`
- Residual TC-08 data: protected `REQ-9002` remains unchanged by explicit instruction; deleted target `REQ-9001` is absent.

