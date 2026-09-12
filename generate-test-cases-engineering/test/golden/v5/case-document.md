# V5 Case Document

- Lineage: lineage-output
- Semantic root: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- Bundle digest: sha256:f95216d762f0b8ccecd06e6a5ec75b22b48e7c705134c2f64ff533615aedf0b2

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

### CASE-03ff3e1f1090910ecb78109cfb7981a96a80ff8b04545b26894aac597f5b8746 — Case conditional [Conditional]

- Module: orders
- Primary Test Point: tp-conditional
- Canonical names: Order
- Scope: 单项

Steps:
1. execute conditional
   - Oracle ORACLE-5b57d385a1411939bea0cb4cd375b69b34888010fa56883151c9664fb2ce24e4: exact_text: done-conditional; scope=single; window=after_step

### CASE-17c815e07d471a1b923ee643b19cba004e110365930d4c6a48bcaa482ed4abdc — Case exploratory [Exploratory]

- Module: orders
- Primary Test Point: tp-exploratory
- Canonical names: Order
- Scope: 单项
- Observation intent: Observe retry latency without asserting a product requirement.

Steps:
1. execute exploratory
   - Oracle ORACLE-d6ced708308620d6da4785fc74dfd15d898222f6e35b8aca02ed83e58f5416b2: exact_text: done-exploratory; scope=single; window=after_step

### CASE-3ca646af180f861dad77b8641d6599a58809a310d6ac16bcfb21991312fa547c — Case grounded [Grounded]

- Module: orders
- Primary Test Point: tp-grounded
- Canonical names: Order
- Scope: 单项

Steps:
1. execute grounded
   - Oracle ORACLE-d384879658f67586969d2013223a040d19f67a4741dfb8212c212b63e0d5443a: exact_text: done-grounded; scope=single; window=after_step

### CASE-90c37e0a00f523faa1d1b5167cea77653abd72e0b2b3bd5da15642c0ed9f0062 — Case blocked [Blocked]

- Module: orders
- Primary Test Point: tp-blocked
- Canonical names: Order
- Scope: 单项
- Blocking gaps: gap-delivery-closed

Steps:
1. execute blocked
   - Oracle ORACLE-5c7d74351ab2708eed80fd40fa7863fd0bb303d3a7f09b52fe229513c8e47ca8: exact_text: done-blocked; scope=single; window=after_step

### CASE-f853cd269e80f2e14d625b34534713eb3027ad7760747a66a056b570948cac52 — Case not-applicable [NotApplicable]

- Module: orders
- Primary Test Point: tp-not-applicable
- Canonical names: Order
- Scope: 单项

Steps:
1. execute not-applicable
   - Oracle ORACLE-527224f206e7299e2e8f854fcd48c5f35a10e4533cda4813f2c8ff8aaeefb2c6: exact_text: done-not-applicable; scope=single; window=after_step

## Material Risks

- risk-api: api_failure (primary)

