# Test Case Bundle

- Schema version: <code>1.0.0</code>
- Source revision: <code>1</code>

## Grounded Cases

_None._

## Conditional Cases

### <code>case\_4d4e5fcef00e6a88</code> — Verify checkout accepted

- Scope: <code>checkout</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_checkout</code>)
- Requirement facts: <code>fact\_checkout</code>
- Formal Test Points: <code>obligation\_7ad4b46aba188b77</code>
- Evidence references: <code>claim\_checkout</code>
- Temporary assumption: <code>claim\_checkout</code>; invalid when A final rule replaces this temporary decision.

#### Preconditions

1. checkout is ready (reachable from: revision start; evidence: <code>claim\_checkout</code>)

#### Test Data

- scenario input = <code>checkout</code> (evidence: <code>claim\_checkout</code>)

#### Steps and Oracles

1. <code>step\_checkout</code> — Exercise checkout (evidence: <code>claim\_checkout</code>)
   - <code>expectation\_checkout</code>: checkout accepted
     - Observe: tester via UI → result
     - Oracle: state equals <code>checkout accepted</code>
     - Evidence: <code>claim\_checkout</code>

#### Post-state and Cleanup

- Post-state: checkout accepted (evidence: <code>claim\_checkout</code>)
- Cleanup: none — The scenario is isolated. (evidence: <code>claim\_checkout</code>)

## Blocked Formal Test Points

_None._

## Exploratory Cases

_None._

## Coverage

### Requirement Fact Ledger

Accounted: 1/1

| Fact | Status |
| --- | --- |
| <code>fact\_checkout</code> | <code>covered</code> |

### Formal Test Point Ledger

Covered: 1/1 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_7ad4b46aba188b77</code> | <code>conditional</code> |

### Grounded Executable Ledger

Grounded: 0/0

| Test Point | Case |
| --- | --- |

### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

### NotApplicable (excluded from the coverage numerator)

_None._

## Quality

- Delivery status: <code>executable\_subset\_ready</code>
- Compiler version: <code>0.1.0</code>
- Schema version: <code>1.0.0</code>
- Source lineage digest: <code>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</code>
- Case-draft lineage digest: <code>cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc</code>
- Limits:
  - Compilation is limited to the supplied revision.
