# Test Case Bundle

- Schema version: <code>2.0.0</code>
- Source revision: <code>1</code>

## Grounded Cases

### <code>case\_1c8a196253a78e34</code> — Verify checkout accepted

- Scope: <code>checkout</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_checkout</code>)
- Requirement facts: <code>fact\_checkout</code>
- Formal Test Points: <code>obligation\_7ad4b46aba188b77</code>
- Evidence references: <code>claim\_checkout</code>

#### Preconditions

1. checkout is ready (reachable from: revision start; evidence: <code>claim\_checkout</code>)

#### Test Data

- scenario input = <code>checkout</code> (evidence: <code>claim\_checkout</code>)

#### Steps and Oracles

1. <code>step\_checkout</code> — Exercise checkout (evidence: <code>claim\_checkout</code>)
   - <code>expectation\_f0d1ffa72c24afa5</code>: checkout accepted
     - Observe: tester via UI → result
     - Oracle: state equals <code>checkout accepted</code>
     - Evidence: <code>claim\_checkout</code>

#### Post-state and Cleanup

- Post-state: checkout accepted (evidence: <code>claim\_checkout</code>)
- Cleanup: none — The scenario is isolated. (evidence: <code>claim\_checkout</code>)

## Conditional Cases

_None._

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
| <code>obligation\_7ad4b46aba188b77</code> | <code>grounded</code> |

### Grounded Executable Ledger

Grounded: 1/1

| Test Point | Case |
| --- | --- |
| <code>obligation\_7ad4b46aba188b77</code> | <code>case\_1c8a196253a78e34</code> |

### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

### NotApplicable (excluded from the coverage numerator)

_None._

## Execution Plan

- Status: <code>ready</code>
- Plan digest: <code>c2fe1fd11be0cdb13441196315a5fbd72435a09ea74a19e0e9159e8a29638714</code>
- Semantic result digest: <code>834a42875d4d6741564467160350a0a447a4cc0769624e0c1766b7424da0b653</code>
- Execute Cases: 1
- DoNotExecute Cases: 0
- DoNotExecute formal Test Points: 0
- DoNotExecute Exploratory items: 0
- Applicable Test Point execution coverage: full 1, partial 0, none 0
- Runner Case IDs: <code>case\_1c8a196253a78e34</code>

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>case</code> | <code>case\_1c8a196253a78e34</code> | Verify checkout accepted | <code>grounded</code> | <code>execute</code> | <code>selected\_for\_run</code> |

## Quality

- Delivery status: <code>executable\_subset\_ready</code>
- Compiler version: <code>0.2.0</code>
- Schema version: <code>2.0.0</code>
- Semantic source digest: <code>f077ac00150cc58283e641ee899d8afb491ac20729e339e5faec1a90ad4817da</code>
- Evidence semantic digest: <code>55049791528884de45f209f6687bd4db24dd3e85af8e8cafde254356b1cd06bc</code>
- Behavior Views semantic digest: <code>5116203c0e991da91ed3bba3aaa21dfd5c77599db67dce7b2532e9b955700fec</code>
- Test Obligations semantic digest: <code>2990ea13a93510c32162b2cead69d00a9270e6eea982e1e750d5a9957c1423b9</code>
- Case Drafts semantic digest: <code>0e79bb15c31ec37de8a47e37903ce1dc58a4dd5ca9a822c62b82952df63402b5</code>
- Limits:
  - Compilation is limited to the supplied revision.
