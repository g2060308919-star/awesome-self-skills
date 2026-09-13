# Execution Plan closure

An Execution Plan is a downstream selection bound to one immutable `case_document_ref`. It is created only on explicit request and never changes Case evidence or Oracles.

## Boundary

The reference includes the Case Document lineage and exact manifest/bundle digests. The compiler verifies the reference before creating the run. Only Grounded Cases explicitly selected for Execute can appear in the runner projection.

## Capability closure

Execution closure evaluates current environment, account, observer, control, test-data, and cleanup capabilities. Every required capability receives typed proof or an explicit unresolved disposition. Capability evidence is operational evidence, not product truth.

## Dispositions

Execute, DoNotExecute, Conditional, and paused selection states remain independent from Grounded, Exploratory, Blocked, and NotApplicable. In particular, DoNotExecute does not turn a Case into NotApplicable, alter an Oracle, or upgrade evidence.

The compiler advertises only the currently legal closure or final-confirmation action. Copy its selector and allowed operation exactly. Cancellation remains available in active execution cells.

## Result

`execution_ready` requires a nonempty, verified runner projection. `no_execution_selected` is a complete result but is not ready to run. This Skill produces or confirms the plan only; browser/API execution, results, and defect records are downstream artifacts that must bind the delivered bundle digest and Case identity.
