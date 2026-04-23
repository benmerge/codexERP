# Platform Architecture

This repo is being rebuilt as one shared Firebase-backed operations platform.

## Core Idea

All tools read and write the same business data model in Firestore.

- `Firebase Auth` handles login
- `Firestore` stores org data, orders, inventory, recipes, locations, and logs
- `Cloud Run` handles server-side tasks like email, imports, and webhooks
- Each app is just a different user interface over the same shared data

## Apps

- `foodcrm-pro`
  - CRM and order entry
  - Customers, sales reps, notifications, and backend integrations
  - Writes the authoritative order records

- `miremix-mrp`
  - Production planning, inventory, recipes, and fulfillment
  - Reads shared CRM orders
  - Writes shipment status back to CRM

- `Data Coop` / `MiData`
  - member-facing cooperative participation flow should live as a platform tool
  - deeper data/dashboard experiences should sit beneath that member-facing surface, not replace the platform shell
  - see [DATA_COOP_ARCHITECTURE.md](./DATA_COOP_ARCHITECTURE.md)

- `EcoStack`
  - asset generator, review workflow, and release system for traceable environmental packages
  - see [ECOSTACK_ARCHITECTURE.md](./ECOSTACK_ARCHITECTURE.md)

- `CRM Core / Vertical Packs`
  - one CRM core with shared account, contact, location, and mapping capabilities
  - vertical packs such as food and fiber should layer on top of the same CRM records
  - see [CRM_VERTICALIZATION_ARCHITECTURE.md](./CRM_VERTICALIZATION_ARCHITECTURE.md)

## Shared Platform Layer

The shared platform model lives in `platform/shared.ts`.

It defines:

- Shared workspace domains
- The shared org id
- The Ben-only location admin accounts
- Org resolution rules for users

## Data Model

The platform is moving toward a canonical org-first model documented in [PLATFORM_DATA_MODEL.md](./PLATFORM_DATA_MODEL.md).

Current transitional collections still include:

- `users/{uid}`
- `users/{orgId}/team`
- `users/{orgId}/customers`
- `users/{orgId}/orders`
- `users/{orgId}/products`
- `users/{orgId}/suppliers`
- `users/{orgId}/tasks`
- `locations`
- `inventory`
- `recipes`
- `logs`

Target canonical collections are:

- `orgs/{orgId}`
- `orgs/{orgId}/members`
- `orgs/{orgId}/locations`
- `orgs/{orgId}/accounts`
- `orgs/{orgId}/contacts`
- `orgs/{orgId}/account_location_links`
- `orgs/{orgId}/territories`
- `orgs/{orgId}/customers`
- `orgs/{orgId}/orders`
- `orgs/{orgId}/products`
- `orgs/{orgId}/inventory`
- `orgs/{orgId}/recipes`
- `orgs/{orgId}/tasks`
- `orgs/{orgId}/submissions`
- `orgs/{orgId}/events`
  - now used as the canonical audit stream for CRM mutations and future automations
- `orgs/{orgId}/entitlements`
  - now becoming the canonical source for launcher access and tool activation state
  - includes provisioning lifecycle so activation can move through pending, ready, and failed states
- `orgs/{orgId}/launch_sessions`
  - now used for the launcher-to-tool handoff so tools can resolve a validated launch context on entry
- `orgs/{orgId}/billing_subscriptions`
  - now reserved as the canonical billing state layer that entitlement records can point to
  - current checkout surface uses a provider abstraction with a manual provider stub
- `orgs/{orgId}/coop_members`
  - now reserved for Data Coop participation and member status inside the platform shell
- `orgs/{orgId}/coop_agreements`
  - now reserved for cooperative-specific agreement records, distinct from general platform access
- `orgs/{orgId}/coop_verifications`
  - now reserved for Data Coop eligibility and internal review workflow
- `orgs/{orgId}/data_assets`
  - now reserved for member-submitted evidence and future document-backed participation records
- `orgs/{orgId}/data_requests`
  - now reserved for member tasks and cooperative participation prompts
- `orgs/{orgId}/data_permissions`
  - now reserved for explicit member consent and downstream data-use permissions
- `orgs/{orgId}/data_access_grants`
  - now reserved for program-level access created after review and approval
- `orgs/{orgId}/projects`
  - now reserved for project identity used by EcoStack package generation
- `orgs/{orgId}/ecostack_packages`
  - now reserved for EcoStack package instances by project and release period
- `orgs/{orgId}/ecostack_package_versions`
  - now reserved for versioned generator/review/release states
- `orgs/{orgId}/ecostack_layer_records`
  - now reserved for canonical layer assembly records across provenance, carbon, biodiversity, water, and community impact
- `orgs/{orgId}/ecostack_source_references`
  - now reserved for source lineage references
- `orgs/{orgId}/ecostack_transformations`
  - now reserved for method and calculation lineage
- `orgs/{orgId}/ecostack_methodologies`
  - now reserved for declared EcoStack methods and versions
- `orgs/{orgId}/ecostack_model_runs`
  - now reserved for per-version execution summaries and derived run outputs
- `orgs/{orgId}/ecostack_approval_records`
  - now reserved for EcoStack review and release decisions
- `orgs/{orgId}/ecostack_output_artifacts`
  - now reserved for buyer, machine-readable, and evidence outputs

Canonical records now live under the org model for:

- `orgs/{orgId}`
- `orgs/{orgId}/members`
- `orgs/{orgId}/customers`
- `orgs/{orgId}/locations`
- `orgs/{orgId}/orders`
- `orgs/{orgId}/products`
- `orgs/{orgId}/suppliers`
- `orgs/{orgId}/settings`
- `orgs/{orgId}/tasks`
- `orgs/{orgId}/inventory`
- `orgs/{orgId}/recipes`
- `orgs/{orgId}/logs`

The first thin `Data Coop` tool now exists locally inside the CRM shell at `/data-coop`.
It currently covers:

- launch-session entry from Platform Home
- cooperative membership initialization
- coop-specific agreement records
- evidence checklist records
- member request records
- baseline data permission records
- downstream access grant records after approval
- verification submission and internal review states
- Firebase Storage-backed evidence uploads
- admin reviewer queue with evidence links
- event logging for membership setup and agreement signing

The first thin `EcoStack` tool now exists locally inside the CRM shell at `/eco-stack`.
It currently covers:

- package creation
- package version creation
- project-aware package targeting and release-period selection
- project metadata for methodology fit, program type, and claim focus
- source lineage built from approved Data Coop and platform records
- transformation lineage scaffolding
- methodology assignment and model-run records
- layer readiness derived from cooperative approvals, permissions, grants, and accepted evidence
- approval history scaffolding
- generated buyer summary / machine JSON / evidence index payloads
- project-level package and version history
- first registry-style export shape embedded in machine JSON
- first-class registry export preview in the workspace
- downloadable buyer, machine JSON, evidence index, and registry artifacts
- review and release state transitions
- refresh-from-platform sync for an existing package version

## Permission Model

- Approved company users can use the apps
- Ben accounts can manage multiple locations
- Other users can still use the app, but they do not get location admin controls
- Firestore rules enforce the shared workspace and write restrictions

## Next Rebuild Steps

1. Make the launcher authoritative from `platform_tools` plus `orgs/{orgId}/entitlements`
2. Expand manual activation/admin controls before billing is introduced
3. Add provisioning workflow state for newly activated tools
4. Define and enforce a launcher-to-tool contract
5. Add billing and checkout after manual activation is proven
6. Reduce or retire legacy top-level collection dependence once the org paths are stable
