# V5 Case Document

- Lineage: lineage-output
- Semantic root: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- Bundle digest: sha256:c965025cfc092bd77a8503cd4a1e409a3691140dbf38e77eccec47c43c4511b7

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

### CASE-0fbd6685591e95e960452b8503fa7f2f0ada9912c8e39901a36b4e7db4475d96 — Case grounded [Grounded]

- Module: orders
- Acceptance role: primary_acceptance
- Primary Test Point: tp-grounded
- Facts: fact-claim-e2
- Scope: 单项

Steps:
1. execute grounded
   - Oracle ORACLE-4631bd997a412d377a23954ffd6a650a77bbf5b31b302d710a352117a9753f61: exact_text: done-grounded; scope=single; window=after_step

### CASE-2de7d9260a866ef648884087ad9f755b18f592799318a6162fd577446f20d516 — Case not-applicable [NotApplicable]

- Module: orders
- Acceptance role: primary_acceptance
- Primary Test Point: tp-not-applicable
- Facts: fact-claim-e2
- Scope: 单项

Steps:
1. execute not-applicable
   - Oracle ORACLE-ffc96eef7bde5e3b1e678f5aee2c6f9476bb745a3c6cd870d1b59ac1cda8d130: exact_text: done-not-applicable; scope=single; window=after_step

### CASE-64b72901a49a9389b95f9f68f87f11e8d451c5fde9b2b4572808988c7d849590 — Case exploratory [Exploratory]

- Module: orders
- Acceptance role: primary_acceptance
- Primary Test Point: tp-exploratory
- Facts: fact-claim-e2
- Scope: 单项

Steps:
1. execute exploratory
   - Oracle ORACLE-12051f041bdf7e13ac21ec4a34bf54de547c5208c19a9315ef86d488eb6cf753: exact_text: done-exploratory; scope=single; window=after_step

### CASE-a4e51014f4401737c741cc4f680a7fe72f36743acec57b551416905229c4e680 — Case conditional [Conditional]

- Module: orders
- Acceptance role: primary_acceptance
- Primary Test Point: tp-conditional
- Facts: fact-claim-e1
- Scope: 单项

Steps:
1. execute conditional
   - Oracle ORACLE-f8798dcec51d3b306f2d589aa5ad25a79edacde184b019b0940a15c94d0e6aa4: exact_text: done-conditional; scope=single; window=after_step

### CASE-ede16b5c51170fe700fbb52ee098925b2d9d98f860c0cd806eedb1e7e22db813 — Case blocked [Blocked]

- Module: orders
- Acceptance role: primary_acceptance
- Primary Test Point: tp-blocked
- Facts: fact-claim-e2
- Scope: 单项

Steps:
1. execute blocked
   - Oracle ORACLE-e8e25a34761e421fe54e1b8faad2e29ae08cd4d27454beba5f07601694879cef: exact_text: done-blocked; scope=single; window=after_step

## Material Risks

- risk-api: api_failure (primary)

