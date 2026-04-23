# Platform Data Model

This document defines the shared data model for the Merge platform.
The goal is to treat CRM, ReMix, Customer Portal, MiData, EcoStack, and future tools as interfaces over one operational system.

## Principles

- Firestore is the system of record for shared business data.
- Tools should read and write shared records instead of creating app-specific parallel data models.
- User permissions should be role-based, not hardcoded per screen.
- Locations, orgs, and users are platform concepts, not tool-local concepts.
- Every major record should be auditable.

## Core Collections

### `orgs/{orgId}`

One document per workspace or operating entity.

Suggested fields:

- `id`
- `name`
- `slug`
- `status`
- `primaryDomain`
- `settings`
- `createdAt`
- `updatedAt`

Use for:

- shared workspace identity
- branding
- tool availability
- default policies

### `orgs/{orgId}/members/{userId}`

Membership records for people who can access the workspace.

Suggested fields:

- `userId`
- `email`
- `displayName`
- `roles`
- `defaultLocationId`
- `isActive`
- `createdAt`
- `updatedAt`

Recommended roles:

- `platform_admin`
- `tool_admin`
- `sales`
- `operations`
- `location_admin`
- `viewer`

### `orgs/{orgId}/locations/{locationId}`

Shared operational sites, warehouses, mills, facilities, or reporting locations.

Suggested fields:

- `id`
- `name`
- `code`
- `type`
- `isActive`
- `address`
- `timeZone`
- `createdAt`
- `updatedAt`
- `deactivatedAt`

Use for:

- ReMix inventory
- production
- order fulfillment
- reporting
- CRM-linked buyer offices, doors, warehouses, and map overlays when a workspace activates CRM mapping

### `orgs/{orgId}/accounts/{accountId}`

Canonical CRM parent account record.

Suggested fields:

- `id`
- `displayName`
- `legalName`
- `accountType`
- `verticalPack`
- `ownerUserId`
- `ownerEmail`
- `pipelineStage`
- `customerCategory`
- `status`
- `territoryId`
- `territoryLabel`
- `hasCurrentQuarterOrder`
- `lastOrderDate`
- `tags`
- `createdAt`
- `updatedAt`

Use for:

- CRM parent-account management
- sales analytics
- territory planning
- vertical-pack overlays for food and fiber

### `orgs/{orgId}/contacts/{contactId}`

Canonical CRM contact record linked to a parent account and optionally to a location.

Suggested fields:

- `id`
- `accountId`
- `linkedLocationId`
- `name`
- `email`
- `phone`
- `title`
- `contactType`
- `isPrimaryBuyer`
- `isActive`
- `createdAt`
- `updatedAt`

Use for:

- buyer contact management
- outreach exports
- parent-account relationship context

### `orgs/{orgId}/account_location_links/{linkId}`

Relationship record between a parent account and a physical or office location.

Suggested fields:

- `id`
- `accountId`
- `locationId`
- `locationType`
- `isBuyerOffice`
- `isDoor`
- `showOnMap`
- `isPrimary`
- `travelPriority`
- `createdAt`
- `updatedAt`

Use for:

- all-door map visibility
- buyer-office-only toggle
- travel planning
- map-ready account footprints

### `orgs/{orgId}/territories/{territoryId}`

Reusable geography and rep-filter layer for CRM and future tools.

Suggested fields:

- `id`
- `label`
- `scope`
- `state`
- `city`
- `region`
- `customRule`
- `createdAt`
- `updatedAt`

Use for:

- CRM territory filters
- travel planning
- future geo service consumers across tools

### `orgs/{orgId}/settings/{settingId}`

Shared workspace settings that multiple tools can use.

Suggested first records:

- `branding`
- `tool_preferences`
- `notifications`

Suggested fields for `branding`:

- `clientLogo`
- `orgId`
- `sourceApp`
- `updatedAt`

Use for:

- shared launcher chrome
- CRM branding
- ReMix branding
- future tool-level workspace presentation

### `orgs/{orgId}/coop_members/{memberId}`

Canonical cooperative participation record for Data Coop.

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
- `operationName`
- `createdAt`
- `updatedAt`

Use for:

- Data Coop onboarding state
- cooperative membership review
- routing members into MiData Dash later

### `orgs/{orgId}/coop_agreements/{agreementRecordId}`

Agreement trail for cooperative-specific legal and revenue participation terms.

Suggested fields:

- `memberId`
- `agreementType`
- `agreementVersion`
- `status`
- `signedAt`
- `signedByUserId`
- `plan`
- `documentRef`
- `title`
- `createdAt`
- `updatedAt`

Use for:

- membership agreement records
- data rights agreement records
- future buyer/data-sharing consent chain

### `orgs/{orgId}/coop_verifications/{verificationId}`

Verification case used to move a cooperative member from self-service enrollment into internal review and approval.

Suggested fields:

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

- member review queues
- internal approval workflow
- downstream program eligibility

### `orgs/{orgId}/data_assets/{assetId}`

Evidence or supporting data item submitted by a cooperative member.

Suggested fields:

- `memberId`
- `assetType`
- `title`
- `status`
- `notes`
- `submittedAt`
- `reviewedAt`
- `createdAt`
- `updatedAt`

Use for:

- onboarding evidence checklist
- future document-vault integration
- traceable source support for downstream participation and program use

The current local Data Coop flow now uses:

- `data_requests` to show cooperative tasks to members
- `data_permissions` to capture baseline cooperative consent
- `data_access_grants` to represent approved downstream access after review

### `orgs/{orgId}/projects/{projectId}`

Canonical project identity used by EcoStack package generation.

Suggested fields:

- `orgId`
- `name`
- `geography`
- `methodologyFit`
- `programType`
- `claimFocus`
- `status`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/ecostack_packages/{packageId}`

EcoStack package instance tied to a project and release period.

Suggested fields:

- `orgId`
- `projectId`
- `releasePeriod`
- `status`
- `currentVersionId`
- `createdAt`
- `updatedAt`

The current local EcoStack flow now lets an operator either:

- create a new project while creating a package
- or target an existing project with a chosen release period

### `orgs/{orgId}/ecostack_package_versions/{versionId}`

Versioned package record for draft, review, approval, and release.

Suggested fields:

- `orgId`
- `packageId`
- `projectId`
- `versionNumber`
- `status`
- `completenessStatus`
- `generatedBy`
- `reviewedBy`
- `approvedBy`
- `releasedAt`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/ecostack_layer_records/{layerId}`

Normalized EcoStack layer assembly records.

Suggested fields:

- `packageVersionId`
- `layerType`
- `status`
- `summary`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/ecostack_source_references/{referenceId}`

Source lineage references for an EcoStack package version.

The current local EcoStack flow now writes references for:

- approved cooperative member records
- approved verification records
- granted data permission records
- active downstream access grants
- accepted evidence assets
- CRM order lineage placeholders

Suggested fields:

- `packageVersionId`
- `sourceType`
- `sourceRecordId`
- `originSystem`
- `createdAt`

### `orgs/{orgId}/ecostack_transformations/{transformationId}`

Transformation lineage for an EcoStack package version.

Suggested fields:

- `packageVersionId`
- `transformationType`
- `methodVersion`
- `logicReference`
- `createdAt`

### `orgs/{orgId}/ecostack_methodologies/{methodologyId}`

Declared methodology catalog used by EcoStack package versions.

Suggested fields:

- `orgId`
- `name`
- `code`
- `version`
- `status`
- `scope`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/ecostack_model_runs/{modelRunId}`

Execution summary for a package version under a declared methodology.

Suggested fields:

- `orgId`
- `packageVersionId`
- `methodologyId`
- `status`
- `eligibleMemberCount`
- `acceptedAssetCount`
- `outputSummary`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/ecostack_approval_records/{approvalId}`

Approval history for an EcoStack package version.

Suggested fields:

- `packageVersionId`
- `action`
- `actorUserId`
- `actorEmail`
- `notes`
- `createdAt`

### `orgs/{orgId}/ecostack_output_artifacts/{artifactId}`

Output artifact registry for EcoStack release objects.

Suggested fields:

- `packageVersionId`
- `artifactType`
- `status`
- `title`
- `summary`
- `payload`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/customers/{customerId}`

Canonical customer or account record used by CRM and future tools.

Suggested fields:

- `id`
- `name`
- `company`
- `email`
- `phone`
- `category`
- `pipelineStage`
- `ownerUserId`
- `status`
- `tags`
- `notes`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/orders/{orderId}`

Canonical order record shared between CRM and operations.

Suggested fields:

- `id`
- `orderNumber`
- `customerId`
- `locationId`
- `status`
- `source`
- `lineItems`
- `currency`
- `amount`
- `requestedShipDate`
- `fulfilledDate`
- `createdAt`
- `updatedAt`

Use for:

- CRM order entry
- ReMix fulfillment
- portal order visibility
- reporting and exports

### `orgs/{orgId}/products/{productId}`

Shared sellable or manufacturable catalog item.

Suggested fields:

- `id`
- `name`
- `sku`
- `category`
- `unit`
- `status`
- `price`
- `supplierId`
- `attributes`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/suppliers/{supplierId}`

Shared vendor record used by CRM and future procurement/reporting tools.

Suggested fields:

- `id`
- `name`
- `contactName`
- `email`
- `phone`
- `category`
- `rating`
- `status`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/inventory/{inventoryItemId}`

Location-aware stock record.

Suggested fields:

- `id`
- `productId`
- `locationId`
- `quantityOnHand`
- `quantityReserved`
- `quantityAvailable`
- `unit`
- `lastCountedAt`
- `updatedAt`

### `orgs/{orgId}/recipes/{recipeId}`

Production or formula record used by ReMix and future manufacturing/reporting tools.

Suggested fields:

- `id`
- `name`
- `finishedGoodId`
- `locationId`
- `ingredients`
- `yield`
- `status`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/tasks/{taskId}`

Shared work item record.

Suggested fields:

- `id`
- `title`
- `description`
- `type`
- `status`
- `assigneeUserId`
- `relatedRecordType`
- `relatedRecordId`
- `dueDate`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/submissions/{submissionId}`

Customer Portal intake for issue reporting, data entry, requests, and uploaded forms.

Suggested fields:

- `id`
- `type`
- `status`
- `submittedBy`
- `locationId`
- `payload`
- `attachments`
- `createdAt`
- `updatedAt`

### Data Coop Addendum

The cooperative participation layer needs explicit records beyond the generic platform collections.

See [DATA_COOP_ARCHITECTURE.md](./DATA_COOP_ARCHITECTURE.md) for the intended model for:

- `orgs/{orgId}/coop_members`
- `orgs/{orgId}/coop_agreements`
- `orgs/{orgId}/coop_verifications`
- `orgs/{orgId}/data_permissions`
- `orgs/{orgId}/data_access_grants`
- `orgs/{orgId}/data_requests`
- `orgs/{orgId}/data_assets`

Important stance:

- the Data Coop is a platform tool
- but cooperative participation, consent, and revenue-linked agreement records should not be flattened into generic launcher or member records

### `orgs/{orgId}/events/{eventId}`

Audit/event log for major changes across tools.

Suggested fields:

- `id`
- `actorUserId`
- `tool`
- `action`
- `recordType`
- `recordId`
- `locationId`
- `metadata`
- `createdAt`

Use for:

- audit history
- debugging
- cross-tool automations
- reporting feeds
- analytics
- downstream reporting

Current implementation:

- CRM now writes append-only org-scoped events for customer, order, product, supplier, and task mutations.
- These records are becoming the shared trigger surface for future integrations, automations, and client-facing activity timelines.

## Tool Registry

### `platform_tools/{toolId}`

Global launcher metadata for platform home.

Suggested fields:

- `id`
- `title`
- `description`
- `href`
- `status`
- `pricingType`
- `priceLabel`
- `provisioningMode`
- `note`
- `accent`
- `enabled`
- `sortOrder`
- `rolesAllowed`

### `orgs/{orgId}/entitlements/{toolId}`

Canonical org-scoped access state for each tool.

Suggested fields:

- `toolId`
- `status`
- `plan`
- `activatedAt`
- `expiresAt`
- `billingSubscriptionId`
- `source`
- `pricingType`
- `provisioningStatus`
- `provisioningRequestedAt`
- `provisioningCompletedAt`
- `failureReason`
- `rolesGranted`
- `updatedAt`

Use for:

- authoritative launcher access
- manual activation before billing exists
- route guards across tools
- provisioning lifecycle
- billing-backed access later

### `orgs/{orgId}/launch_sessions/{launchId}`

Short-lived launcher-to-tool handoff records.

Suggested fields:

- `id`
- `createdAt`
- `launchedAt`
- `launcherToolId`
- `orgId`
- `returnUrl`
- `status`
- `targetUrl`
- `toolId`
- `userEmail`
- `userId`

Use for:

- platform-to-tool launch validation
- preserving return context
- auditing launches
- future signed/session-based federation

### `orgs/{orgId}/billing_subscriptions/{subscriptionId}`

Canonical billing records for org-scoped tools.

Suggested fields:

- `provider`
- `status`
- `toolId`
- `amount`
- `currency`
- `renewalDate`
- `plan`
- `createdAt`
- `updatedAt`

Use for:

- billing-backed entitlements
- renewal visibility in the launcher
- payment provider reconciliation later
- manual billing placeholders before checkout is wired

Current implementation:

- The platform now exposes a checkout-session API surface with a manual provider stub.
- Successful manual checkout returns into the launcher and finalizes the billing subscription and entitlement records.

## Recommended Relationship Model

- `orgs` own all core business records.
- `members` define who can access an org.
- `locations` scope operational activity.
- `orders` connect customers, products, and fulfillment.
- `inventory` and `recipes` drive operations.
- `submissions` bring in external data from portals.
- `events` provide a shared audit trail.
- `entitlements` determine whether a tool can be launched for an org.
- `launch_sessions` define how a tool is opened from the platform shell.
- `billing_subscriptions` define the canonical billing record for paid tool access.

## Migration Direction

### Current CRM shape

Current CRM data is primarily stored under:

- `users/{orgId}/customers`
- `users/{orgId}/orders`
- `users/{orgId}/products`
- `users/{orgId}/suppliers`
- `users/{orgId}/tasks`
- `users/{orgId}/team`

### Current ReMix shape

Current ReMix data is primarily stored in top-level collections:

- `locations`
- `inventory`
- `recipes`
- `logs`
- `settings`

### Target platform shape

Move over time toward:

- `orgs/{orgId}/members`
- `orgs/{orgId}/locations`
- `orgs/{orgId}/customers`
- `orgs/{orgId}/orders`
- `orgs/{orgId}/products`
- `orgs/{orgId}/inventory`
- `orgs/{orgId}/recipes`
- `orgs/{orgId}/tasks`
- `orgs/{orgId}/submissions`
- `orgs/{orgId}/events`
- `orgs/{orgId}/entitlements`
- `orgs/{orgId}/launch_sessions`
- `orgs/{orgId}/billing_subscriptions`

## Recommended Build Sequence

1. Make the launcher authoritative from `platform_tools` plus `orgs/{orgId}/entitlements`.
2. Add manual activation and org-admin controls before billing.
3. Add provisioning workflow state for newly activated tools.
4. Define a launcher-to-tool contract for all federated surfaces.
5. Add billing and checkout after manual activation is stable.
6. Build Customer Portal and MiData on top of the shared model instead of creating separate schemas.
