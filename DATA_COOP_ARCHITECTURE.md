# Data Coop Architecture

This document defines the intended product and system shape for the Merge Data Coop and MiData layers inside the Merge OS ecosystem.

## Product Structure

The platform should be structured in three layers:

1. `Merge OS`
   - Platform shell, launcher, billing, entitlements, org context, and routing
2. `Data Coop`
   - Member-facing cooperative participation experience
   - Join, pay, sign agreements, verify, upload, respond to requests, and manage participation
3. `MiData Dash`
   - Core data and analysis experience reached from inside the Data Coop flow
   - Used for deeper visibility, reporting, participation history, and future downstream program data views

The key distinction is:

- `Data Coop` is the user-facing product a member joins
- `MiData` is the deeper data layer and dashboard experience that supports and extends that participation

This avoids treating the member-facing cooperative UX and the deeper data/analysis system as the same thing.

## UX Direction

Target user flow:

1. User signs into `Merge OS`
2. User sees the `Data Coop` tool card
3. User selects `Data Coop`
4. User activates membership
5. User pays the annual fee when required
6. User completes required cooperative agreements and verification
7. User reaches the `Data Coop` home
8. User can open:
   - signed agreements
   - data requests
   - data entry portal
   - `MiData Dash`

Important UX rule:

- `Merge OS` remains the platform front door
- `Data Coop` is the cooperative participation tool
- `MiData Dash` lives inside or directly beneath the `Data Coop` experience, not as a separate first-step launcher card in v1

## Agreement Stance

The Data Coop must have its own agreement layer.

This is not optional or interchangeable with generic platform terms because members are:

- sharing data with buyers and downstream programs
- granting explicit data-use rights
- participating in a cooperative revenue model
- potentially entitled to a share of cooperative value creation

That means the platform needs dedicated cooperative agreement records, versioning, and traceability.

The Data Coop agreement model must preserve:

- agreement type
- agreement version
- signer identity
- signed timestamp
- organization context
- member context
- linked plan or membership type
- status

## Architecture Stance

`Data Coop` should be implemented as a platform tool, but not as a fully isolated app silo.

Instead:

- the user-facing `Data Coop` UI is a tool surface
- the records it depends on should be treated as shared platform-grade records
- downstream tools like `EcoStack`, reporting, and partner programs should consume canonical participation records instead of inventing their own member onboarding systems

This means the Data Coop is both:

- a tool UX
- and a platform participation layer

## Canonical Record Model

The following records should be added under the shared org-first model.

### `orgs/{orgId}/coop_members/{memberId}`

Cooperative participation record for an individual or participating entity.

Suggested fields:

- `id`
- `userId`
- `orgId`
- `displayName`
- `email`
- `memberType`
- `status`
- `plan`
- `joinedAt`
- `approvedAt`
- `defaultHome`
- `createdAt`
- `updatedAt`

Use for:

- member home
- cooperative membership lifecycle
- downstream program eligibility

Important note:

- a platform member is not always the same thing as a cooperative member

### `orgs/{orgId}/coop_agreements/{agreementRecordId}`

Signed agreement records for cooperative participation.

Suggested fields:

- `id`
- `memberId`
- `agreementType`
- `agreementVersion`
- `status`
- `signedAt`
- `signedByUserId`
- `plan`
- `documentRef`
- `createdAt`
- `updatedAt`

Use for:

- legal traceability
- member status gating
- downstream program eligibility

### `orgs/{orgId}/coop_verifications/{verificationId}`

Verification cases for identity, farm participation, or program eligibility review.

Suggested fields:

- `id`
- `memberId`
- `type`
- `status`
- `reviewerUserId`
- `evidenceRefs`
- `submittedAt`
- `reviewedAt`
- `notes`
- `createdAt`
- `updatedAt`

Use for:

- approval workflow
- admin review
- auditability

### `orgs/{orgId}/data_permissions/{permissionId}`

Standing permissions and consent records governing how member data may be used.

Suggested fields:

- `id`
- `memberId`
- `scope`
- `purpose`
- `status`
- `grantedAt`
- `revokedAt`
- `agreementVersion`
- `programId`
- `createdAt`
- `updatedAt`

Use for:

- consent tracking
- downstream data-use control
- buyer/program authorization

### `orgs/{orgId}/data_access_grants/{grantId}`

Program- or buyer-specific grants that tie consent to actual downstream use.

Suggested fields:

- `id`
- `memberId`
- `programId`
- `buyerId`
- `dataTypes`
- `status`
- `grantedAt`
- `expiresAt`
- `linkedPermissionIds`
- `createdAt`
- `updatedAt`

Use for:

- buyer program access
- EcoStack and reporting interoperability
- proof of authorized downstream use

### `orgs/{orgId}/data_requests/{requestId}`

Requests for information, uploads, forms, or data actions shown inside the Data Coop experience.

Suggested fields:

- `id`
- `memberId`
- `type`
- `status`
- `title`
- `description`
- `dueAt`
- `requestedBy`
- `targetProgram`
- `createdAt`
- `updatedAt`

Use for:

- member tasks
- structured data collection
- cooperative engagement workflows

### `orgs/{orgId}/data_assets/{assetId}`

Uploaded or connected files/data assets associated with cooperative participation.

Suggested fields:

- `id`
- `memberId`
- `assetType`
- `source`
- `status`
- `storageRef`
- `uploadedBy`
- `uploadedAt`
- `verificationStatus`
- `createdAt`
- `updatedAt`

Use for:

- uploads
- data connection history
- evidence for verification and downstream programs

## Relationship To Existing Platform Records

The Data Coop should build on top of:

- `platform_tools`
- `orgs/{orgId}/entitlements`
- `orgs/{orgId}/billing_subscriptions`
- `orgs/{orgId}/launch_sessions`
- `orgs/{orgId}/events`
- `orgs/{orgId}/submissions`

Where possible:

- use `submissions` for general portal-style intake
- use `events` for auditability
- use `entitlements` for tool access
- use `billing_subscriptions` for membership payment state

But do not overload generic platform records with all cooperative-specific meaning. Cooperative participation needs explicit records of its own.

## Billing and Entitlement Model

Recommended v1 model:

- `Data Coop` is a paid tool entitlement
- annual fee can start as `$99/year`
- platform entitlement unlocks the `Data Coop` tool
- membership completion still depends on:
  - payment
  - required cooperative agreements
  - verification steps where required

This means:

- payment alone should not imply full cooperative completion
- entitlement grants access to the tool
- onboarding records determine participation readiness

## Downstream Tool Relationship

`EcoStack`, reporting tools, and future buyer-facing or stewardship programs should not create duplicate cooperative onboarding systems.

Instead they should consume canonical records from:

- `coop_members`
- `coop_agreements`
- `data_permissions`
- `data_access_grants`
- `data_assets`
- `events`

This is the main architectural reason to build the Data Coop carefully now.

## Recommended Delivery Sequence

1. Add `Data Coop` as a platform tool with paid entitlement support
2. Build member-facing Data Coop onboarding and home
3. Implement cooperative agreement records and version tracking
4. Add verification cases and admin review
5. Add data permissions and access grants
6. Add data requests and asset uploads
7. Expose `MiData Dash` inside the Data Coop experience
8. Use canonical Data Coop records to unlock `EcoStack` and other downstream tools
