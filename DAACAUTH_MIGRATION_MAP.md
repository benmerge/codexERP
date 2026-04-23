# daacauth Migration Map

This document maps the existing `daacauth` repo into the emerging `Merge OS -> Data Coop -> MiData` platform structure.

Source repo reviewed:

- [`/Users/baimac/Documents/Playground/daacauth`](/Users/baimac/Documents/Playground/daacauth)

Core source files reviewed:

- [`src/App.tsx`](/Users/baimac/Documents/Playground/daacauth/src/App.tsx)
- [`src/hooks/useEnrollment.tsx`](/Users/baimac/Documents/Playground/daacauth/src/hooks/useEnrollment.tsx)
- [`src/types.ts`](/Users/baimac/Documents/Playground/daacauth/src/types.ts)
- [`src/pages/AccountPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/AccountPage.tsx)
- [`src/pages/PaymentPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/PaymentPage.tsx)
- [`src/pages/AgreementsPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/AgreementsPage.tsx)
- [`src/pages/VerificationPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/VerificationPage.tsx)
- [`src/pages/UploadsPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/UploadsPage.tsx)
- [`src/pages/MemberHomePage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/MemberHomePage.tsx)
- [`firestore.rules`](/Users/baimac/Documents/Playground/daacauth/firestore.rules)

## Executive Read

`daacauth` is a strong product-flow reference for the future `Data Coop` tool, but it should not be migrated as-is.

Keep:

- the resumable onboarding sequence
- the page structure
- the step gating behavior
- the member-facing agreement/payment/verification UX ideas

Replace:

- the single `users/{userId}.enrollment` blob model
- app-local uploads structure
- app-local role model
- app-local Firestore rules

Target product structure:

1. `Merge OS`
   - platform shell
   - launcher
   - entitlements
   - billing
   - launch routing
2. `Data Coop`
   - member-facing cooperative participation tool
3. `MiData Dash`
   - deeper data/dashboard layer inside the Data Coop experience

## Current daacauth Shape

Current state model centers around:

- `UserProfile`
- `EnrollmentState`

Current data shape:

- `users/{userId}`
  - `role`
  - `enrollment`
- `users/{userId}/uploads/{uploadId}`

This works for a prototype, but it is too flat and app-local for the shared platform.

## Recommended Target Shape

The future Data Coop should build on the records defined in:

- [`DATA_COOP_ARCHITECTURE.md`](/Users/baimac/Documents/Playground/codexERP/DATA_COOP_ARCHITECTURE.md)

Primary target records:

- `platform_tools/data-coop`
- `orgs/{orgId}/entitlements/data-coop`
- `orgs/{orgId}/billing_subscriptions/{subscriptionId}`
- `orgs/{orgId}/coop_members/{memberId}`
- `orgs/{orgId}/coop_agreements/{agreementRecordId}`
- `orgs/{orgId}/coop_verifications/{verificationId}`
- `orgs/{orgId}/data_permissions/{permissionId}`
- `orgs/{orgId}/data_access_grants/{grantId}`
- `orgs/{orgId}/data_requests/{requestId}`
- `orgs/{orgId}/data_assets/{assetId}`
- `orgs/{orgId}/events/{eventId}`

## Page-by-Page Migration Map

### 1. Landing / Pricing / Auth

Source pages:

- [`src/pages/LandingPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/LandingPage.tsx)
- [`src/pages/PricingPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/PricingPage.tsx)
- [`src/pages/LoginPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/LoginPage.tsx)
- [`src/pages/SignupPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/SignupPage.tsx)

Keep:

- pricing explanation
- focused Data Coop positioning
- member-friendly onboarding tone

Move to:

- `Merge OS` tool card opens `Data Coop`
- sign-in should use shared platform auth, not separate auth logic
- pricing becomes tool metadata plus Data Coop-specific onboarding content

Target records:

- `platform_tools/data-coop`
- `orgs/{orgId}/entitlements/data-coop`
- `orgs/{orgId}/billing_subscriptions/{subscriptionId}`

### 2. Account Setup

Source page:

- [`src/pages/AccountPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/AccountPage.tsx)

Current behavior:

- collects legal name
- collects operation name
- selects a plan
- writes to `enrollment.accountProfile`

Keep:

- first-step profile capture
- plan selection step

Replace with:

- create or update `coop_members/{memberId}`
- store member-facing plan choice in cooperative records, not just local onboarding state

Target records:

- `orgs/{orgId}/coop_members/{memberId}`

Suggested mapping:

- `accountProfile.legalName` -> `coop_members.displayName` or member legal profile subfields
- `accountProfile.operationName` -> `coop_members.operationName` or linked farm/operation reference
- `selectedPlan` -> `coop_members.plan`

### 3. Payment

Source page:

- [`src/pages/PaymentPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/PaymentPage.tsx)

Current behavior:

- mock payment
- writes `paymentStatus: paid` into enrollment state

Keep:

- clear member-facing payment step
- annual fee framing

Replace with:

- platform checkout session
- canonical `billing_subscriptions`
- entitlement activation for `data-coop`

Target records:

- `orgs/{orgId}/billing_subscriptions/{subscriptionId}`
- `orgs/{orgId}/entitlements/data-coop`
- `orgs/{orgId}/events/{eventId}`

Important rule:

- payment should unlock the tool
- payment alone should not mean the member is fully onboarded

### 4. Agreements

Source page:

- [`src/pages/AgreementsPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/AgreementsPage.tsx)

Current behavior:

- signs three agreements inside `enrollment.agreements`
- stores signature name and timestamp

Keep:

- modal signing UX
- progress visibility
- plain-language explanation

Replace with:

- first-class cooperative agreement records
- explicit agreement version records
- no generic flattening into one enrollment blob

Target records:

- `orgs/{orgId}/coop_agreements/{agreementRecordId}`
- `orgs/{orgId}/events/{eventId}`

Important architecture note:

- these agreements are central to the Data Coop because they govern data sharing, cooperative participation, and revenue-linked participation
- they should remain easy to review later inside the member home

### 5. Verification

Source page:

- [`src/pages/VerificationPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/VerificationPage.tsx)

Current behavior:

- collects legal and operation info
- writes a `verification.submission`
- directly marks status as `approved`

Keep:

- verification form concept
- structured review state

Replace with:

- explicit verification case record
- admin review workflow
- approved/rejected/in-review lifecycle controlled outside the member form

Target records:

- `orgs/{orgId}/coop_verifications/{verificationId}`
- `orgs/{orgId}/events/{eventId}`

Important correction:

- member submission should not auto-approve itself in the long-term product

### 6. Uploads / Tool Unlock

Source page:

- [`src/pages/UploadsPage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/UploadsPage.tsx)

Current behavior:

- blocks entry until verification is approved
- links out to Toolbox, MiData, and Document Vault through env URLs

Keep:

- post-verification unlock model
- idea of surfacing available next destinations

Replace with:

- platform launch contract
- Data Coop home as the proper next destination
- uploads and external data entry modeled as first-class assets/requests, not just static links

Target records:

- `orgs/{orgId}/data_assets/{assetId}`
- `orgs/{orgId}/data_requests/{requestId}`
- `orgs/{orgId}/launch_sessions/{launchId}`
- `orgs/{orgId}/events/{eventId}`

Important direction:

- in the new product, this step should evolve from “open external links” into “enter the Data Coop home and see next actions”

### 7. Member Home

Source page:

- [`src/pages/MemberHomePage.tsx`](/Users/baimac/Documents/Playground/daacauth/src/pages/MemberHomePage.tsx)

Current behavior:

- shows membership status
- shows payment and agreement counts
- shows links to external tools

Keep:

- the concept of a stable post-onboarding home
- status summaries
- agreement history visibility

Replace with:

- `Data Coop` home inside Merge OS
- member record summary driven by canonical records
- no dependency on one giant enrollment state blob

Target records used for rendering:

- `coop_members`
- `coop_agreements`
- `coop_verifications`
- `data_assets`
- `data_requests`
- `data_permissions`
- `data_access_grants`
- `billing_subscriptions`
- `events`

## State Mapping

Current `EnrollmentState` should be decomposed as follows:

- `accountCreated` -> derived from presence of `coop_member`
- `accountProfile` -> `coop_members`
- `selectedPlan` -> `coop_members.plan` plus billing/subscription context
- `paymentStatus` -> `billing_subscriptions.status` and `entitlements.status`
- `agreements` -> `coop_agreements`
- `verification` -> `coop_verifications`
- `uploads` -> `data_assets`
- `uploadAccessUnlocked` -> derived from entitlement + verification + agreement completion
- `onboardingComplete` -> derived member readiness state, not a single free-floating boolean

## Rules Migration

Current rules in [`firestore.rules`](/Users/baimac/Documents/Playground/daacauth/firestore.rules) are app-local and user-local.

Keep conceptually:

- owner can read their own records
- admin can review and intervene

Replace structurally:

- org-scoped access
- cooperative member records separate from platform member records
- explicit admin review rights for verification and agreement operations
- data asset and permission rules tied to cooperative participation

## What To Reuse Directly

Reasonable candidates for partial reuse:

- page layouts and copy patterns
- stepper UX
- resume logic
- agreement modal structure
- member-home composition ideas

Candidates to rewrite instead of porting:

- `useEnrollment` data model
- `UserProfile.enrollment`
- Firestore rules
- payment state handling
- uploads storage model

## Recommended Migration Sequence

1. Add `Data Coop` as a platform tool entry inside Merge OS
2. Add canonical `coop_members`
3. Add canonical `coop_agreements`
4. Add canonical `coop_verifications`
5. Add Data Coop home and resumable onboarding state resolver
6. Add `data_assets` and `data_requests`
7. Add `data_permissions` and `data_access_grants`
8. Move `MiData Dash` under the Data Coop experience

## Bottom Line

`daacauth` should be treated as:

- the current best reference for the member journey

It should not be treated as:

- the future platform schema
- the long-term auth/entitlement authority
- the canonical cooperative data model
