# V5 Case Document

- Lineage: lineage-output
- Semantic root: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- Bundle digest: sha256:006a9f868a332ea49c94f5b87e7b56e55213244ce90953ef4f9b5f763cefbb0c

## Classification

| Status | Count |
|---|---:|
| Blocked | 1 |
| Conditional | 1 |
| Exploratory | 1 |
| Grounded | 1 |
| NotApplicable | 1 |

## Coverage

| Metric | Total | Covered | Gap/Blocked | N/A |
|---|---:|---:|---:|---:|
| Formal Test Point | 4 | 2 | 1 | 1 |
| Semantic partition | 2 | 1 | 1 | 0 |
| Value instance | 1 | 1 | 0 | 0 |
| Permission cell | 3 | 1 | 1 | 1 |

## Cases

### CASE-40d94218490a73c86ce72bf40d8dd5a9f6de6fcd5ad3b28761f66ab005358f9a — Case exploratory [Exploratory]

- Module: orders
- Primary Test Point: tp-exploratory
- Canonical names: Order
- Scope: 当前响应
- Observation intent: Observe retry latency without asserting a product requirement.

Steps:
1. execute exploratory
   - Oracle ORACLE-0295921004f548d7d2c5094face6d1cf41bce028aa97ff03e5254c730fa111fb: exact_text: done-exploratory; scope=single; window=after_step

### CASE-4eb6d560c3c307e85dd1d4c8d8dbfe08b6b464c0d2b904085609dba2a6bdeffe — Case grounded [Grounded]

- Module: orders
- Primary Test Point: tp-grounded
- Canonical names: Order
- Scope: 当前响应

Steps:
1. execute grounded
   - Oracle ORACLE-ce192e991378f816bc7bce337c6f0cf984286084d2e2c103552a1216e8436a7a: exact_text: done-grounded; scope=single; window=after_step

### CASE-a94945ecf16ebc6ec1ad1e4f9a736fab5b92e0bcd5fef5c8e3c1811f1f863ddc — Case conditional [Conditional]

- Module: orders
- Primary Test Point: tp-conditional
- Canonical names: Order
- Scope: 当前响应

Steps:
1. execute conditional
   - Oracle ORACLE-9c1d997bce627c814d612bed0eaf581dacd0625446636dffdd798d879cda66fe: exact_text: done-conditional; scope=single; window=after_step

### CASE-bb846cab510738989cbdab0f60f28ca274cb11a73eb3cc26746103f33469224f — Case blocked [Blocked]

- Module: orders
- Primary Test Point: tp-blocked
- Canonical names: Order
- Scope: 当前响应
- Blocking gaps: gap-delivery-closed

Steps:
1. execute blocked
   - Oracle ORACLE-e10d9ed54599923e5aa7356817431d0a9a6751e03ece57dd954102ab413a8516: exact_text: done-blocked; scope=single; window=after_step

### CASE-f74c62333350c5a401f5d937936b0333dc9cfa108679f214233b2236d9d3aedd — Case not-applicable [NotApplicable]

- Module: orders
- Primary Test Point: tp-not-applicable
- Canonical names: Order
- Scope: 当前响应

Steps:
1. execute not-applicable
   - Oracle ORACLE-cdc4cb1215b5c43e8289be1627b8c285b2de1a003091636f9587dde63c28fe5d: exact_text: done-not-applicable; scope=single; window=after_step

## Material Risks

- risk-api: api_failure (primary)

