# EcoStack Architecture

This document defines the intended first-principles architecture for EcoStack inside the Merge OS ecosystem.

## Product Stance

EcoStack is not a dashboard-first tool.

It is:

- a generator
- a review workflow
- a release system
- a lineage-preserving asset package builder

Its job is to turn distributed Merge records into a market-facing environmental asset package that can be reviewed, approved, and released with traceability intact.

## Position In Merge OS

The platform layers should work like this:

1. `Merge OS`
   - auth
   - launcher
   - entitlements
   - billing
   - org context
2. `Data Coop`
   - participation, agreements, evidence, permissions, and downstream access rights
3. `EcoStack`
   - asset generator using project, MRV, consent, and approval context

Important rule:

- EcoStack should consume canonical participation and access records from Data Coop
- it should not invent a separate consent or member-rights system

## First Canonical Records

The first EcoStack foundation should use these org-scoped collections:

### `orgs/{orgId}/projects/{projectId}`

Canonical project identity for EcoStack generation.

### `orgs/{orgId}/ecostack_packages/{packageId}`

One EcoStack package per project and release period.

### `orgs/{orgId}/ecostack_package_versions/{versionId}`

Versioned package state used for generation, review, approval, and release.

### `orgs/{orgId}/ecostack_layer_records/{layerId}`

Normalized layer records for:

- provenance
- carbon
- biodiversity
- water
- community impact

### `orgs/{orgId}/ecostack_source_references/{referenceId}`

Source lineage references tied to a package version.

### `orgs/{orgId}/ecostack_transformations/{transformationId}`

Transformation or model-run lineage tied to a package version.

### `orgs/{orgId}/ecostack_methodologies/{methodologyId}`

Declared methodology catalog used by EcoStack package versions.

### `orgs/{orgId}/ecostack_model_runs/{modelRunId}`

Execution summary for a package version under a declared methodology.

### `orgs/{orgId}/ecostack_approval_records/{approvalId}`

Review and release decision history for a package version.

### `orgs/{orgId}/ecostack_output_artifacts/{artifactId}`

Output artifact registry for:

- buyer-facing package
- machine-readable JSON
- evidence index

## First Implementation Goal

The first thin EcoStack workspace should prove:

1. package creation
2. version creation
3. canonical lineage assembly from Data Coop and platform records
4. completeness gating before review
5. approval history
6. output artifact tracking

The current local implementation now:

- reads approved `coop_members`
- requires approved `coop_verifications`
- requires granted `data_permissions`
- requires active `data_access_grants`
- requires accepted `data_assets`
- lets a package target a selected or newly created project plus release period
- uses project metadata for methodology fit, program type, and claim focus
- builds canonical `ecostack_source_references` from those records
- assigns a declared `ecostack_methodology`
- writes a canonical `ecostack_model_run`
- derives layer readiness before a package can move into review
- shapes buyer summary and machine JSON output using project-level program intent
- introduces a first registry-style export draft inside machine JSON
- exposes that registry draft as its own first-class preview block in the workspace
- supports direct download of buyer summary, machine JSON, evidence index, and registry export artifacts
- exposes project-level package and version history in the workspace
- generates first-pass buyer summary, machine JSON, and evidence index payloads

That gives the future generator a real backbone before we add heavy MRV normalization and market-facing polish.
