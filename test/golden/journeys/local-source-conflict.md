# Test Case Bundle

- Schema version: <code>1.0.0</code>
- Source revision: <code>1</code>

## Grounded Cases

### <code>case\_2be14d4a4e8c473f</code> — Verify shipping confirmed

- Scope: <code>checkout.shipping</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_shipping</code>)
- Requirement facts: <code>fact\_shipping</code>
- Formal Test Points: <code>obligation\_96bd8760ebfe5988</code>
- Evidence references: <code>claim\_shipping</code>

#### Preconditions

1. shipping is ready (reachable from: revision start; evidence: <code>claim\_shipping</code>)

#### Test Data

- scenario input = <code>shipping</code> (evidence: <code>claim\_shipping</code>)

#### Steps and Oracles

1. <code>step\_shipping</code> — Exercise shipping (evidence: <code>claim\_shipping</code>)
   - <code>expectation\_shipping</code>: shipping confirmed
     - Observe: tester via UI → result
     - Oracle: state equals <code>shipping confirmed</code>
     - Evidence: <code>claim\_shipping</code>

#### Post-state and Cleanup

- Post-state: shipping confirmed (evidence: <code>claim\_shipping</code>)
- Cleanup: none — The scenario is isolated. (evidence: <code>claim\_shipping</code>)

## Conditional Cases

_None._

## Blocked Formal Test Points

### <code>obligation\_ec24a566f5d992ac</code>

- Root issue: <code>root\_8ff3a1ca4f4e9795</code>
- Risk: <code>critical</code>
- Reason: <code>UNRESOLVED\_CONFLICT</code>
- Missing type: <code>source-conflict</code>
- Required material: claim\_payment, unresolved-source-policy, view\_payment#rule\_payment
- Recovery question: Clarification required for source-conflict in checkout.payment.

## Exploratory Cases

_None._

## Coverage

### Requirement Fact Ledger

Accounted: 2/2

| Fact | Status |
| --- | --- |
| <code>fact\_payment</code> | <code>blocked</code> |
| <code>fact\_shipping</code> | <code>covered</code> |

### Formal Test Point Ledger

Covered: 1/2 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_96bd8760ebfe5988</code> | <code>grounded</code> |
| <code>obligation\_ec24a566f5d992ac</code> | <code>blocked</code> |

### Grounded Executable Ledger

Grounded: 1/1

| Test Point | Case |
| --- | --- |
| <code>obligation\_96bd8760ebfe5988</code> | <code>case\_2be14d4a4e8c473f</code> |

### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

### NotApplicable (excluded from the coverage numerator)

_None._

## Quality

- Delivery status: <code>critical\_gaps</code>
- Compiler version: <code>0.1.0</code>
- Schema version: <code>1.0.0</code>
- Source lineage digest: <code>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</code>
- Case-draft lineage digest: <code>cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc</code>
- Limits:
  - Compilation is limited to the supplied revision.
