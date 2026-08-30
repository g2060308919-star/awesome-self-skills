# Manual session start required

- Observed at: 2026-08-29T17:39:17Z
- Source: fresh Chrome DevTools accessibility snapshot of `http://127.0.0.1:61570/`
- Browser context: `b2b-e2e-rc-001-20260829T173309Z`
- Page title: `Procurement desk — non-production demo`
- Visible environment marker: `Non-production demo · Local QA`
- Visible page text: `This synthetic workspace requires a human to start the demo session.`
- Visible controls: required `Display name` textbox and `Sign in manually` button
- Observation: no case execution has started; the controlled browser is waiting for the user to start the demo session manually.
- Evidence limitation: Chrome DevTools returned the structured observation but rejected both absolute and relative screenshot file paths as outside its configured workspace roots. No screenshot was persisted and no browser fallback was used.

