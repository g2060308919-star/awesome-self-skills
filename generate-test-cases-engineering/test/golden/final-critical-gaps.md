# Test Case Bundle

- Schema version: <code>1.0.0</code>
- Source revision: <code>4</code>

## Grounded Cases

### <code>case\_grounded</code> — Submit a ready cart

- Scope: <code>checkout</code>
- Risk: <code>high</code>
- Role: buyer (evidence: <code>claim\_role</code>)
- Requirement facts: <code>fact\_grounded</code>
- Formal Test Points: <code>obligation\_grounded</code>
- Evidence references: <code>claim\_action</code>, <code>claim\_capability</code>, <code>claim\_cleanup</code>, <code>claim\_data</code>, <code>claim\_grounded</code>, <code>claim\_oracle\_grounded</code>, <code>claim\_role</code>

#### Preconditions

1. cart is ready (reachable from: empty cart; evidence: <code>claim\_grounded</code>)

#### Test Data

- cart total boundary = <code>100.00</code> (derivation: <code>claim\_data</code>)

#### Steps and Oracles

1. <code>step\_submit</code> — Submit checkout (evidence: <code>claim\_action</code>)
   - <code>expectation\_order\_accepted</code>: The order is accepted
     - Observe: tester via UI → order status
     - Oracle: state equals <code>accepted</code>
     - Evidence: <code>claim\_oracle\_grounded</code>

#### Post-state and Cleanup

- Post-state: order accepted (evidence: <code>claim\_oracle\_grounded</code>)
- Cleanup: none — The isolated order may remain for audit (evidence: <code>claim\_cleanup</code>)

## Conditional Cases

_None._

## Blocked Formal Test Points

### <code>obligation\_blocked</code>

- Root issue: <code>root\_1b6bf4470ac73ce7</code>
- Risk: <code>critical</code>
- Reason: <code>MISSING\_ORACLE</code>
- Missing type: <code>oracle</code>
- Required material: claim\_blocked, claim\_oracle\_blocked
- Recovery question: What state proves that a refund failed?

## Exploratory Cases

### <code>exploratory\_latency</code> — Probe degraded-network latency

- Scope: <code>checkout/network</code>
- Risk: <code>medium</code>
- Reason: Risk hypothesis outside formal Test Point coverage; evidence: claim\_latency\_risk

## Coverage

### Requirement Fact Ledger

Accounted: 3/3

| Fact | Status |
| --- | --- |
| <code>fact\_blocked</code> | <code>blocked</code> |
| <code>fact\_grounded</code> | <code>covered</code> |
| <code>fact\_na</code> | <code>not\_applicable</code> |

### Formal Test Point Ledger

Covered: 1/3 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_blocked</code> | <code>blocked</code> |
| <code>obligation\_grounded</code> | <code>grounded</code> |
| <code>obligation\_na</code> | <code>not\_applicable</code> |

### Grounded Executable Ledger

Grounded: 1/1

| Test Point | Case |
| --- | --- |
| <code>obligation\_grounded</code> | <code>case\_grounded</code> |

### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall requires hidden benchmark labels.

### NotApplicable (excluded from the coverage numerator)

| Test Point | Exclusion evidence | Scope | Review |
| --- | --- | --- | --- |
| <code>obligation\_na</code> | <code>claim\_exclusion</code> | <code>checkout/legacy</code> | <code>supported</code> |

## Quality

- Delivery status: <code>critical\_gaps</code>
- Compiler version: <code>0.1.0</code>
- Schema version: <code>1.0.0</code>
- Source lineage digest: <code>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</code>
- Case-draft lineage digest: <code>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</code>
- Limits:
  - Markdown is a projection and is not evidence.
  - The bundle accounts only for accepted source facts and model Test Points.
