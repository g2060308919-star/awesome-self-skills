# V1 Expert Adjudication and Capture Protocol

This protocol keeps generation inputs, captured outputs, and hidden labels in separate directories. The current repository contains only a synthetic pilot used to test machinery. It is not external expert evidence and is never release-eligible.

## Frozen capture procedure

For every PRD, run exactly `long-prompt`, `test-case-designer`, `technique-router`, and `generate-test-cases` three independent times against the same original `sources/` and `task.json`. Do not expose expert obligations, supported-assertion decisions, accepted-case decisions, historical-defect labels, prior outputs, or diagnostics to a generation session. Store raw outputs under the case's `captured/` directory, never below its label directory.

Every capture records the Skill, compiler, Schema, model, prompt/reference, baseline, benchmark version, repeat number, source digest, task digest, capture kind, and review time. These digests bind every run to the exact original materials and task scope. The scorer reads only captured artifacts and versioned local labels. It must not call a model, fetch a URL, or use the runtime compiler.

## Independent labels and adjudication

Two test experts independently and completely label every expert Test Point, generated factual claim, and generated Case. Anchor presence and semantic support are separate fields: a present source locator does not imply that the source supports the claim. Expert identities and complete label sets remain recorded beside the final labels.

Any disagreement requires a completed adjudication with the exact `label_key`, both expert values, resolved value, adjudicator, completion time, and rationale. The final label must equal expert agreement or the completed resolution. Corrections create a new `label_version` with `correction_of`; prior labels are retained and never overwritten.

## Evaluation-only evidence

Traceable historical defects may be searched and routed as risk evidence, but never override target requirements. Every explicitly high-risk case includes offline business-model mutations. Mutation kills are reported as a separate enhancement signal and never act as an online truth or release gate.

## Completeness and release boundary

V1 requires all six frozen strata, at least five PRDs per stratum, three critical expert Test Points, two clarification-required PRDs, and five traceable historical defects per stratum. Every PRD requires all twelve captures. Missing labels, runs, disagreements, strata, provenance, or a mandatory nonzero denominator yields `insufficient_evidence`.

Release gates use separate precision, recall, acceptance, defect-recall, and stability metrics with separate confidence intervals. No average may hide an unsupported critical/high Grounded Oracle or a weak domain. The process hard gates are silent formal Test Point loss, fixed-round clarification stop, automatic repeat of unknown/deferred, and recovery of an old revision.
