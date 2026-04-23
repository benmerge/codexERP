import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, FileJson, FileText, GitBranch, Leaf, ShieldCheck } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAppContext } from '../data/AppContext';
import { crmAppConfig } from '../config';
import { consumeToolLaunchSession, resolveToolLaunchSession } from '../platform/launch';
import { writePlatformEvent } from '../platform/data';
import { canManagePlatform, resolveOrgId } from '../platform/shared';

type EcoStackProject = {
  id: string;
  orgId: string;
  name: string;
  geography: string;
  methodologyFit: 'ecostack-core' | 'soil-carbon' | 'biodiversity-stewardship' | 'water-resilience';
  programType: 'stacked-credit' | 'insetting' | 'data-licensing';
  claimFocus: 'stacked' | 'carbon' | 'biodiversity' | 'water';
  status: 'draft' | 'active';
  createdAt?: string;
  updatedAt?: string;
};

type EcoStackPackage = {
  id: string;
  orgId: string;
  projectId: string;
  releasePeriod: string;
  status: 'draft' | 'in_review' | 'approved' | 'released' | 'superseded';
  currentVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type EcoStackPackageVersion = {
  id: string;
  packageId: string;
  projectId: string;
  orgId: string;
  methodologyId?: string | null;
  modelRunId?: string | null;
  versionNumber: number;
  status: 'draft' | 'in_review' | 'approved' | 'released' | 'superseded';
  completenessStatus: 'incomplete' | 'ready';
  generatedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  releasedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type EcoStackLayerRecord = {
  id: string;
  packageVersionId: string;
  layerType: 'provenance' | 'carbon' | 'biodiversity' | 'water' | 'community-impact';
  status: 'required' | 'ready' | 'informational';
  summary: string;
  createdAt?: string;
  updatedAt?: string;
};

type EcoStackSourceReference = {
  id: string;
  packageVersionId: string;
  sourceType: string;
  sourceRecordId: string;
  originSystem: string;
  createdAt?: string;
};

type EcoStackTransformation = {
  id: string;
  packageVersionId: string;
  transformationType: string;
  methodVersion: string;
  logicReference: string;
  createdAt?: string;
};

type EcoStackApprovalRecord = {
  id: string;
  packageVersionId: string;
  action: 'submitted' | 'approved' | 'released';
  actorUserId?: string | null;
  actorEmail?: string | null;
  notes?: string | null;
  createdAt?: string;
};

type EcoStackOutputArtifact = {
  id: string;
  packageVersionId: string;
  artifactType: 'buyer-summary' | 'machine-json' | 'evidence-index';
  status: 'draft' | 'released';
  title?: string;
  summary?: string;
  payload?: string;
  createdAt?: string;
  updatedAt?: string;
};

type EcoStackMethodology = {
  id: string;
  orgId: string;
  name: string;
  code: string;
  version: string;
  status: 'draft' | 'active';
  scope: string;
  createdAt?: string;
  updatedAt?: string;
};

type EcoStackModelRun = {
  id: string;
  orgId: string;
  packageVersionId: string;
  methodologyId: string;
  status: 'draft' | 'completed';
  eligibleMemberCount: number;
  acceptedAssetCount: number;
  outputSummary: string;
  createdAt?: string;
  updatedAt?: string;
};

type CoopMemberRecord = {
  id: string;
  userId: string;
  email?: string;
  displayName?: string;
  status?: 'invited' | 'enrolling' | 'pending_review' | 'active' | 'needs_changes';
  operationName?: string;
};

type CoopVerificationRecord = {
  id: string;
  memberId: string;
  status: 'not_started' | 'submitted' | 'approved' | 'rejected' | 'needs_changes';
};

type DataPermissionRecord = {
  id: string;
  memberId: string;
  status: 'granted' | 'revoked' | 'pending';
  programId?: string | null;
};

type DataAccessGrantRecord = {
  id: string;
  memberId: string;
  programId: string;
  status: 'active' | 'pending' | 'expired';
};

type DataAssetRecord = {
  id: string;
  memberId: string;
  assetType: string;
  status: 'required' | 'submitted' | 'accepted';
  downloadUrl?: string | null;
};

type DerivedEcoStackMember = {
  member: CoopMemberRecord;
  verification: CoopVerificationRecord;
  permission: DataPermissionRecord;
  accessGrant: DataAccessGrantRecord;
  acceptedAssets: DataAssetRecord[];
};

const REQUIRED_ECOSTACK_ASSET_TYPES = ['operation-profile', 'ownership-proof'];
const METHODOLOGY_OPTIONS = [
  { value: 'ecostack-core', label: 'EcoStack Core' },
  { value: 'soil-carbon', label: 'Soil Carbon' },
  { value: 'biodiversity-stewardship', label: 'Biodiversity Stewardship' },
  { value: 'water-resilience', label: 'Water Resilience' },
] as const;
const PROGRAM_TYPE_OPTIONS = [
  { value: 'stacked-credit', label: 'Stacked Credit' },
  { value: 'insetting', label: 'Insetting' },
  { value: 'data-licensing', label: 'Data Licensing' },
] as const;
const CLAIM_FOCUS_OPTIONS = [
  { value: 'stacked', label: 'Stacked Claims' },
  { value: 'carbon', label: 'Carbon' },
  { value: 'biodiversity', label: 'Biodiversity' },
  { value: 'water', label: 'Water' },
] as const;

export function EcoStackHome() {
  const { user, login } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<EcoStackProject[]>([]);
  const [packages, setPackages] = useState<EcoStackPackage[]>([]);
  const [versions, setVersions] = useState<EcoStackPackageVersion[]>([]);
  const [layers, setLayers] = useState<EcoStackLayerRecord[]>([]);
  const [sources, setSources] = useState<EcoStackSourceReference[]>([]);
  const [transformations, setTransformations] = useState<EcoStackTransformation[]>([]);
  const [approvals, setApprovals] = useState<EcoStackApprovalRecord[]>([]);
  const [artifacts, setArtifacts] = useState<EcoStackOutputArtifact[]>([]);
  const [methodologies, setMethodologies] = useState<EcoStackMethodology[]>([]);
  const [modelRuns, setModelRuns] = useState<EcoStackModelRun[]>([]);
  const [coopMembers, setCoopMembers] = useState<CoopMemberRecord[]>([]);
  const [coopVerifications, setCoopVerifications] = useState<CoopVerificationRecord[]>([]);
  const [dataPermissions, setDataPermissions] = useState<DataPermissionRecord[]>([]);
  const [dataAccessGrants, setDataAccessGrants] = useState<DataAccessGrantRecord[]>([]);
  const [dataAssets, setDataAssets] = useState<DataAssetRecord[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('new');
  const [draftProjectName, setDraftProjectName] = useState<string>('EcoStack Cooperative Project');
  const [draftProjectGeography, setDraftProjectGeography] = useState<string>('Cooperative portfolio');
  const [draftMethodologyFit, setDraftMethodologyFit] = useState<EcoStackProject['methodologyFit']>('ecostack-core');
  const [draftProgramType, setDraftProgramType] = useState<EcoStackProject['programType']>('stacked-credit');
  const [draftClaimFocus, setDraftClaimFocus] = useState<EcoStackProject['claimFocus']>('stacked');
  const [draftReleasePeriod, setDraftReleasePeriod] = useState<string>(new Date().getFullYear().toString());
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const orgId = resolveOrgId(user, crmAppConfig.sharedOrgId);
  const canAdmin = canManagePlatform(user?.email);

  useEffect(() => {
    const launchId = searchParams.get('launchId');
    if (!launchId || !user || !orgId) return;

    let isMounted = true;

    void (async () => {
      const launch = await resolveToolLaunchSession({ db, launchId, orgId });
      if (!launch || launch.toolId !== 'eco-stack' || launch.userId !== user.uid) return;

      await consumeToolLaunchSession({ db, launchId, orgId });

      if (!isMounted) return;
      setLaunchMessage(`Opened from Platform Home for ${user.email}.`);
      const next = new URLSearchParams(searchParams);
      next.delete('launchId');
      setSearchParams(next, { replace: true });
    })();

    return () => {
      isMounted = false;
    };
  }, [orgId, searchParams, setSearchParams, user]);

  useEffect(() => {
    if (!orgId || !user) {
      setProjects([]);
      setPackages([]);
      setVersions([]);
      setLayers([]);
      setSources([]);
      setTransformations([]);
      setApprovals([]);
      setArtifacts([]);
      setMethodologies([]);
      setModelRuns([]);
      setCoopMembers([]);
      setCoopVerifications([]);
      setDataPermissions([]);
      setDataAccessGrants([]);
      setDataAssets([]);
      return;
    }

    const unsubscribeProjects = onSnapshot(collection(db, `orgs/${orgId}/projects`), (snapshot) => {
      setProjects(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackProject)));
    });
    const unsubscribePackages = onSnapshot(collection(db, `orgs/${orgId}/ecostack_packages`), (snapshot) => {
      setPackages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackPackage)));
    });
    const unsubscribeVersions = onSnapshot(collection(db, `orgs/${orgId}/ecostack_package_versions`), (snapshot) => {
      setVersions(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackPackageVersion)));
    });
    const unsubscribeLayers = onSnapshot(collection(db, `orgs/${orgId}/ecostack_layer_records`), (snapshot) => {
      setLayers(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackLayerRecord)));
    });
    const unsubscribeSources = onSnapshot(collection(db, `orgs/${orgId}/ecostack_source_references`), (snapshot) => {
      setSources(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackSourceReference)));
    });
    const unsubscribeTransformations = onSnapshot(collection(db, `orgs/${orgId}/ecostack_transformations`), (snapshot) => {
      setTransformations(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackTransformation)));
    });
    const unsubscribeApprovals = onSnapshot(collection(db, `orgs/${orgId}/ecostack_approval_records`), (snapshot) => {
      setApprovals(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackApprovalRecord)));
    });
    const unsubscribeArtifacts = onSnapshot(collection(db, `orgs/${orgId}/ecostack_output_artifacts`), (snapshot) => {
      setArtifacts(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackOutputArtifact)));
    });
    const unsubscribeMethodologies = onSnapshot(collection(db, `orgs/${orgId}/ecostack_methodologies`), (snapshot) => {
      setMethodologies(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackMethodology)));
    });
    const unsubscribeModelRuns = onSnapshot(collection(db, `orgs/${orgId}/ecostack_model_runs`), (snapshot) => {
      setModelRuns(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as EcoStackModelRun)));
    });
    const unsubscribeCoopMembers = onSnapshot(collection(db, `orgs/${orgId}/coop_members`), (snapshot) => {
      setCoopMembers(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CoopMemberRecord)));
    });
    const unsubscribeCoopVerifications = onSnapshot(collection(db, `orgs/${orgId}/coop_verifications`), (snapshot) => {
      setCoopVerifications(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CoopVerificationRecord)));
    });
    const unsubscribePermissions = onSnapshot(collection(db, `orgs/${orgId}/data_permissions`), (snapshot) => {
      setDataPermissions(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as DataPermissionRecord)));
    });
    const unsubscribeAccessGrants = onSnapshot(collection(db, `orgs/${orgId}/data_access_grants`), (snapshot) => {
      setDataAccessGrants(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as DataAccessGrantRecord)));
    });
    const unsubscribeDataAssets = onSnapshot(collection(db, `orgs/${orgId}/data_assets`), (snapshot) => {
      setDataAssets(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as DataAssetRecord)));
    });

    return () => {
      unsubscribeProjects();
      unsubscribePackages();
      unsubscribeVersions();
      unsubscribeLayers();
      unsubscribeSources();
      unsubscribeTransformations();
      unsubscribeApprovals();
      unsubscribeArtifacts();
      unsubscribeMethodologies();
      unsubscribeModelRuns();
      unsubscribeCoopMembers();
      unsubscribeCoopVerifications();
      unsubscribePermissions();
      unsubscribeAccessGrants();
      unsubscribeDataAssets();
    };
  }, [orgId, user]);

  const latestPackage = packages[0] ?? null;
  const latestVersion =
    versions.find((entry) => entry.id === latestPackage?.currentVersionId) ??
    versions[0] ??
    null;
  const currentPackage =
    (activePackageId ? packages.find((entry) => entry.id === activePackageId) ?? null : null) ??
    latestPackage;
  const currentVersion =
    (activeVersionId ? versions.find((entry) => entry.id === activeVersionId) ?? null : null) ??
    (currentPackage?.currentVersionId ? versions.find((entry) => entry.id === currentPackage.currentVersionId) ?? null : null) ??
    latestVersion;
  const currentVersionLayers = currentVersion
    ? layers.filter((entry) => entry.packageVersionId === currentVersion.id)
    : [];
  const currentVersionSources = currentVersion
    ? sources.filter((entry) => entry.packageVersionId === currentVersion.id)
    : [];
  const currentVersionTransformations = currentVersion
    ? transformations.filter((entry) => entry.packageVersionId === currentVersion.id)
    : [];
  const currentVersionApprovals = currentVersion
    ? approvals.filter((entry) => entry.packageVersionId === currentVersion.id)
    : [];
  const currentVersionArtifacts = currentVersion
    ? artifacts.filter((entry) => entry.packageVersionId === currentVersion.id)
    : [];
  const currentProject = currentVersion?.projectId
    ? projects.find((entry) => entry.id === currentVersion.projectId) ?? null
    : null;
  const currentMethodology = currentVersion?.methodologyId
    ? methodologies.find((entry) => entry.id === currentVersion.methodologyId) ?? null
    : methodologies[0] ?? null;
  const currentModelRun = currentVersion?.modelRunId
    ? modelRuns.find((entry) => entry.id === currentVersion.modelRunId) ?? null
    : modelRuns.find((entry) => entry.packageVersionId === currentVersion?.id) ?? null;
  const selectedProject = selectedProjectId !== 'new'
    ? projects.find((entry) => entry.id === selectedProjectId) ?? null
    : null;
  const visibleProject = currentProject ?? selectedProject;
  const visibleProjectPackages = visibleProject
    ? packages
        .filter((entry) => entry.projectId === visibleProject.id)
        .sort((a, b) => (b.releasePeriod || '').localeCompare(a.releasePeriod || ''))
    : [];
  const visibleProjectVersions = visibleProject
    ? versions.filter((entry) => entry.projectId === visibleProject.id).sort((a, b) => b.versionNumber - a.versionNumber)
    : [];

  useEffect(() => {
    if (!packages.length) {
      setActivePackageId(null);
      return;
    }

    if (activePackageId && packages.some((entry) => entry.id === activePackageId)) return;
    setActivePackageId(packages[0]?.id ?? null);
  }, [activePackageId, packages]);

  useEffect(() => {
    if (!versions.length) {
      setActiveVersionId(null);
      return;
    }

    if (activeVersionId && versions.some((entry) => entry.id === activeVersionId)) return;
    const fallbackVersionId = currentPackage?.currentVersionId ?? versions[0]?.id ?? null;
    setActiveVersionId(fallbackVersionId);
  }, [activeVersionId, currentPackage?.currentVersionId, versions]);

  useEffect(() => {
    if (selectedProject) {
      setDraftProjectName(selectedProject.name);
      setDraftProjectGeography(selectedProject.geography);
      setDraftMethodologyFit(selectedProject.methodologyFit);
      setDraftProgramType(selectedProject.programType);
      setDraftClaimFocus(selectedProject.claimFocus);
    }
  }, [selectedProject]);
  const describeProgramType = (programType: EcoStackProject['programType']) =>
    programType === 'stacked-credit'
      ? 'stacked environmental credit issuance'
      : programType === 'insetting'
        ? 'buyer-aligned insetting and supply-chain decarbonization'
        : 'data licensing and analytics distribution';
  const describeClaimFocus = (claimFocus: EcoStackProject['claimFocus']) =>
    claimFocus === 'stacked'
      ? 'carbon, biodiversity, and water outcomes in one coordinated package'
      : claimFocus === 'carbon'
        ? 'carbon performance and removals'
        : claimFocus === 'biodiversity'
          ? 'biodiversity stewardship and habitat outcomes'
          : 'water stewardship and resilience outcomes';
  const resolveMethodologyDefinition = (
    methodologyFit: EcoStackProject['methodologyFit'],
    claimFocus: EcoStackProject['claimFocus']
  ) => {
    switch (methodologyFit) {
      case 'soil-carbon':
        return {
          code: 'SOIL-CARBON',
          name: 'Soil Carbon Quantification Method',
          version: '1.0.0',
          scope: `Project packages focused on ${describeClaimFocus(claimFocus)} using approved cooperative evidence and participation records.`,
        };
      case 'biodiversity-stewardship':
        return {
          code: 'BIODIV-CARE',
          name: 'Biodiversity Stewardship Method',
          version: '1.0.0',
          scope: `Project packages focused on ${describeClaimFocus(claimFocus)} using approved cooperative evidence and participation records.`,
        };
      case 'water-resilience':
        return {
          code: 'WATER-RES',
          name: 'Water Resilience Method',
          version: '1.0.0',
          scope: `Project packages focused on ${describeClaimFocus(claimFocus)} using approved cooperative evidence and participation records.`,
        };
      default:
        return {
          code: 'ECOSTACK-CORE',
          name: 'EcoStack Core Stacked Credit Method',
          version: '0.2.0',
          scope: `Project packages focused on ${describeClaimFocus(claimFocus)} using approved cooperative evidence and participation records.`,
        };
    }
  };
  const carbonSection = (claimFocus: EcoStackProject['claimFocus'], acceptedAssetsCount: number) =>
    claimFocus === 'stacked' || claimFocus === 'carbon'
      ? `Carbon narrative: ${acceptedAssetsCount > 0 ? `${acceptedAssetsCount} accepted evidence assets support carbon-oriented package assembly.` : 'Carbon-oriented evidence is still incomplete for this package.'}`
      : 'Carbon narrative: Carbon is not the primary claim focus for this package.';
  const biodiversitySection = (
    claimFocus: EcoStackProject['claimFocus'],
    eligibleMembersCount: number,
    acceptedAssetsCount: number
  ) =>
    claimFocus === 'stacked' || claimFocus === 'biodiversity'
      ? `Biodiversity narrative: ${eligibleMembersCount > 0 && acceptedAssetsCount > 0 ? 'Approved participation and accepted evidence support biodiversity stewardship framing.' : 'Biodiversity framing still needs more approved evidence or participation records.'}`
      : 'Biodiversity narrative: Biodiversity is not the primary claim focus for this package.';
  const waterSection = (
    claimFocus: EcoStackProject['claimFocus'],
    eligibleMembersCount: number,
    acceptedAssetsCount: number
  ) =>
    claimFocus === 'stacked' || claimFocus === 'water'
      ? `Water narrative: ${eligibleMembersCount > 0 && acceptedAssetsCount > 0 ? 'Current approved evidence supports water resilience and stewardship positioning.' : 'Water resilience positioning still needs more verified source material.'}`
      : 'Water narrative: Water is not the primary claim focus for this package.';

  const eligibleMembers = useMemo<DerivedEcoStackMember[]>(() => {
    const approvedVerifications = new Map(
      coopVerifications
        .filter((entry) => entry.status === 'approved')
        .map((entry) => [entry.memberId, entry] as const)
    );
    const grantedPermissions = new Map(
      dataPermissions
        .filter((entry) => entry.status === 'granted' && entry.programId === 'mida-core')
        .map((entry) => [entry.memberId, entry] as const)
    );
    const activeGrants = new Map(
      dataAccessGrants
        .filter((entry) => entry.status === 'active' && entry.programId === 'mida-core')
        .map((entry) => [entry.memberId, entry] as const)
    );

    return coopMembers
      .filter((entry) => entry.status === 'active')
      .map((member) => {
        const acceptedAssets = dataAssets.filter(
          (asset) =>
            asset.memberId === member.userId &&
            asset.status === 'accepted' &&
            REQUIRED_ECOSTACK_ASSET_TYPES.includes(asset.assetType)
        );
        return {
          member,
          verification: approvedVerifications.get(member.userId),
          permission: grantedPermissions.get(member.userId),
          accessGrant: activeGrants.get(member.userId),
          acceptedAssets,
        };
      })
      .filter(
        (entry): entry is DerivedEcoStackMember =>
          !!entry.verification &&
          !!entry.permission &&
          !!entry.accessGrant &&
          REQUIRED_ECOSTACK_ASSET_TYPES.every((assetType) =>
            entry.acceptedAssets.some((asset) => asset.assetType === assetType)
          )
      );
  }, [coopMembers, coopVerifications, dataPermissions, dataAccessGrants, dataAssets]);

  const ecosystemReadiness = useMemo(() => {
    const acceptedAssetsCount = eligibleMembers.reduce((sum, entry) => sum + entry.acceptedAssets.length, 0);
    const sourceReferenceCount = eligibleMembers.length * 4 + acceptedAssetsCount + 1;
    const allRequiredLayersReady = eligibleMembers.length > 0 && acceptedAssetsCount > 0;

    return {
      acceptedAssetsCount,
      allRequiredLayersReady,
      eligibleMembersCount: eligibleMembers.length,
      sourceReferenceCount,
    };
  }, [eligibleMembers]);

  const presentPackageStatus = (status?: EcoStackPackage['status'] | null) =>
    status === 'in_review'
      ? 'In review'
      : status === 'approved'
        ? 'Approved'
        : status === 'released'
          ? 'Released'
          : status === 'superseded'
            ? 'Superseded'
            : status === 'draft'
              ? 'Draft'
              : 'Not started';
  const presentCompleteness = (status?: EcoStackPackageVersion['completenessStatus'] | null) =>
    status === 'ready' ? 'Ready for review' : status === 'incomplete' ? 'Needs more inputs' : 'Unknown';
  const presentMethodologyFit = (value?: EcoStackProject['methodologyFit'] | null) =>
    METHODOLOGY_OPTIONS.find((option) => option.value === value)?.label ?? 'Not set';
  const presentProgramType = (value?: EcoStackProject['programType'] | null) =>
    PROGRAM_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? 'Not set';
  const presentClaimFocus = (value?: EcoStackProject['claimFocus'] | null) =>
    CLAIM_FOCUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Not set';

  const workflowChecklist = [
    {
      id: 'project',
      label: 'Project setup is defined',
      detail: currentProject
        ? `${currentProject.name} • ${presentMethodologyFit(currentProject.methodologyFit)} • ${presentClaimFocus(currentProject.claimFocus)}`
        : 'Create a project or choose an existing one to begin package work.',
      ready: !!currentProject,
    },
    {
      id: 'inputs',
      label: 'Cooperative inputs are approved',
      detail:
        ecosystemReadiness.eligibleMembersCount > 0
          ? `${ecosystemReadiness.eligibleMembersCount} eligible participants with ${ecosystemReadiness.acceptedAssetsCount} accepted evidence assets are ready.`
          : 'Data Coop still needs approved members, permissions, and accepted evidence.',
      ready: ecosystemReadiness.eligibleMembersCount > 0 && ecosystemReadiness.acceptedAssetsCount > 0,
    },
    {
      id: 'package',
      label: 'Package draft exists',
      detail: currentVersion
        ? `Version ${currentVersion.versionNumber} is active for ${currentPackage?.releasePeriod || 'the current release period'}.`
        : 'Create the first package draft to generate layers and outputs.',
      ready: !!currentVersion,
    },
    {
      id: 'review',
      label: 'Package is ready for review',
      detail: currentVersion
        ? presentCompleteness(currentVersion.completenessStatus)
        : 'No package is ready for review yet.',
      ready: currentVersion?.completenessStatus === 'ready',
    },
    {
      id: 'release',
      label: 'Package is released',
      detail: currentVersion
        ? `Current status: ${presentPackageStatus(currentVersion.status)}`
        : 'Release becomes available after review and approval.',
      ready: currentVersion?.status === 'released',
    },
  ];
  const nextRecommendedAction =
    !currentProject
      ? 'Start by defining the project and release period.'
      : !currentVersion
        ? 'Create the first EcoStack package draft.'
        : currentVersion.completenessStatus !== 'ready'
          ? 'Refresh from approved data until the package is ready for review.'
          : currentVersion.status === 'draft'
            ? 'Move the package into review.'
            : currentVersion.status === 'in_review'
              ? canAdmin
                ? 'Approve the package when review is complete.'
                : 'Wait for an admin to approve the package.'
              : currentVersion.status === 'approved'
                ? canAdmin
                  ? 'Release the package and use the outputs below.'
                  : 'Wait for an admin to release the package.'
                : 'Review the outputs and decide what needs to change next.';

  const buildBuyerSummaryPayload = (
    projectName: string,
    projectGeography: string,
    releasePeriod: string,
    projectMetadata: Pick<EcoStackProject, 'methodologyFit' | 'programType' | 'claimFocus'>
  ) => {
    const method = resolveMethodologyDefinition(projectMetadata.methodologyFit, projectMetadata.claimFocus);
    const participantNames = eligibleMembers.map(
      (entry) => entry.member.operationName || entry.member.displayName || entry.member.email || entry.member.userId
    );

    return [
      `EcoStack Buyer Summary`,
      `Project: ${projectName}`,
      `Geography: ${projectGeography}`,
      `Release period: ${releasePeriod}`,
      `Program type: ${describeProgramType(projectMetadata.programType)}`,
      `Claim focus: ${describeClaimFocus(projectMetadata.claimFocus)}`,
      `Method: ${method.code} v${method.version}`,
      `Eligible cooperative participants: ${ecosystemReadiness.eligibleMembersCount}`,
      `Accepted evidence assets: ${ecosystemReadiness.acceptedAssetsCount}`,
      `Source references assembled: ${ecosystemReadiness.sourceReferenceCount}`,
      participantNames.length ? `Participants: ${participantNames.join(', ')}` : 'Participants: none yet',
      `Program thesis: ${projectName} is being assembled as a ${describeProgramType(projectMetadata.programType)} package centered on ${describeClaimFocus(projectMetadata.claimFocus)} across ${projectGeography}.`,
      carbonSection(projectMetadata.claimFocus, ecosystemReadiness.acceptedAssetsCount),
      biodiversitySection(projectMetadata.claimFocus, ecosystemReadiness.eligibleMembersCount, ecosystemReadiness.acceptedAssetsCount),
      waterSection(projectMetadata.claimFocus, ecosystemReadiness.eligibleMembersCount, ecosystemReadiness.acceptedAssetsCount),
      ecosystemReadiness.allRequiredLayersReady
        ? 'Readiness: All required layers are currently ready for review.'
        : 'Readiness: Additional approved participation or evidence is still required before review.',
    ].join('\n');
  };

  const buildMachineJsonPayload = (
    projectName: string,
    projectGeography: string,
    releasePeriod: string,
    projectMetadata: Pick<EcoStackProject, 'methodologyFit' | 'programType' | 'claimFocus'>
  ) =>
    JSON.stringify(
      {
        project: {
          name: projectName,
          geography: projectGeography,
          releasePeriod,
          methodologyFit: projectMetadata.methodologyFit,
          programType: projectMetadata.programType,
          claimFocus: projectMetadata.claimFocus,
        },
        methodology: resolveMethodologyDefinition(projectMetadata.methodologyFit, projectMetadata.claimFocus),
        claims: {
          focus: projectMetadata.claimFocus,
          carbon:
            projectMetadata.claimFocus === 'stacked' || projectMetadata.claimFocus === 'carbon'
              ? {
                  included: true,
                  readiness: ecosystemReadiness.acceptedAssetsCount > 0 ? 'ready' : 'incomplete',
                  narrative: carbonSection(projectMetadata.claimFocus, ecosystemReadiness.acceptedAssetsCount),
                }
              : { included: false },
          biodiversity:
            projectMetadata.claimFocus === 'stacked' || projectMetadata.claimFocus === 'biodiversity'
              ? {
                  included: true,
                  readiness:
                    ecosystemReadiness.eligibleMembersCount > 0 && ecosystemReadiness.acceptedAssetsCount > 0 ? 'ready' : 'incomplete',
                  narrative: biodiversitySection(
                    projectMetadata.claimFocus,
                    ecosystemReadiness.eligibleMembersCount,
                    ecosystemReadiness.acceptedAssetsCount
                  ),
                }
              : { included: false },
          water:
            projectMetadata.claimFocus === 'stacked' || projectMetadata.claimFocus === 'water'
              ? {
                  included: true,
                  readiness:
                    ecosystemReadiness.eligibleMembersCount > 0 && ecosystemReadiness.acceptedAssetsCount > 0 ? 'ready' : 'incomplete',
                  narrative: waterSection(
                    projectMetadata.claimFocus,
                    ecosystemReadiness.eligibleMembersCount,
                    ecosystemReadiness.acceptedAssetsCount
                  ),
                }
              : { included: false },
        },
        readiness: ecosystemReadiness,
        externalExports: {
          buyerPackage: {
            type: 'buyer-diligence-package',
            releasePeriod,
            projectName,
            methodCode: resolveMethodologyDefinition(projectMetadata.methodologyFit, projectMetadata.claimFocus).code,
          },
          registrySubmissionDraft: {
            type: 'registry-submission-draft',
            registryFamily:
              projectMetadata.programType === 'stacked-credit'
                ? 'environmental-credit'
                : projectMetadata.programType === 'insetting'
                  ? 'insetting-disclosure'
                  : 'data-rights-disclosure',
            claimFocus: projectMetadata.claimFocus,
            packageStatus: ecosystemReadiness.allRequiredLayersReady ? 'candidate' : 'draft',
          },
        },
        participants: eligibleMembers.map((entry) => ({
          memberId: entry.member.userId,
          operationName: entry.member.operationName || null,
          displayName: entry.member.displayName || null,
          verificationId: entry.verification.id,
          permissionId: entry.permission.id,
          accessGrantId: entry.accessGrant.id,
          acceptedAssetIds: entry.acceptedAssets.map((asset) => asset.id),
        })),
      },
      null,
      2
    );

  const buildEvidenceIndexPayload = (
    projectName: string,
    releasePeriod: string,
    projectMetadata: Pick<EcoStackProject, 'methodologyFit' | 'programType' | 'claimFocus'>
  ) =>
    [
      `Project: ${projectName}`,
      `Release period: ${releasePeriod}`,
      `Program type: ${projectMetadata.programType}`,
      `Claim focus: ${projectMetadata.claimFocus}`,
      ...eligibleMembers
        .flatMap((entry) =>
          entry.acceptedAssets.map((asset) => ({
            memberId: entry.member.userId,
            operationName: entry.member.operationName || entry.member.displayName || entry.member.email || entry.member.userId,
            assetId: asset.id,
            assetType: asset.assetType,
            downloadUrl: asset.downloadUrl || null,
          }))
        )
        .map(
          (entry) =>
            `${entry.operationName} | ${entry.assetType} | ${entry.assetId}${entry.downloadUrl ? ` | ${entry.downloadUrl}` : ''}`
        ),
    ].join('\n');

  const buildLayerBlueprint = (
    projectName: string,
    projectMetadata: Pick<EcoStackProject, 'methodologyFit' | 'programType' | 'claimFocus'>
  ) => {
    const memberCount = ecosystemReadiness.eligibleMembersCount;
    const acceptedAssetsCount = ecosystemReadiness.acceptedAssetsCount;
    const carbonRequired = ['stacked', 'carbon'].includes(projectMetadata.claimFocus);
    const biodiversityRequired = ['stacked', 'biodiversity'].includes(projectMetadata.claimFocus);
    const waterRequired = ['stacked', 'water'].includes(projectMetadata.claimFocus);

    return [
      {
        layerType: 'provenance' as const,
        status: memberCount > 0 ? 'ready' as const : 'required' as const,
        summary:
          memberCount > 0
            ? `${memberCount} approved cooperative member records now anchor the chain of custody for ${projectName}.`
            : 'Waiting on at least one approved cooperative member with active downstream access.',
      },
      {
        layerType: 'carbon' as const,
        status: carbonRequired ? (acceptedAssetsCount > 0 ? 'ready' as const : 'required' as const) : 'informational' as const,
        summary:
          carbonRequired
            ? acceptedAssetsCount > 0
              ? `${acceptedAssetsCount} accepted evidence assets are available for carbon claim assembly.`
              : 'Accepted evidence assets are still needed before carbon claims can be assembled.'
            : 'Carbon layer is informational for this project configuration.',
      },
      {
        layerType: 'biodiversity' as const,
        status: biodiversityRequired ? (memberCount > 0 && acceptedAssetsCount > 0 ? 'ready' as const : 'required' as const) : 'informational' as const,
        summary:
          biodiversityRequired
            ? memberCount > 0 && acceptedAssetsCount > 0
              ? 'Approved participation and accepted evidence are available for biodiversity normalization.'
              : 'Needs approved participation plus accepted evidence before biodiversity packaging can proceed.'
            : 'Biodiversity layer is informational for this project configuration.',
      },
      {
        layerType: 'water' as const,
        status: waterRequired ? (memberCount > 0 && acceptedAssetsCount > 0 ? 'ready' as const : 'required' as const) : 'informational' as const,
        summary:
          waterRequired
            ? memberCount > 0 && acceptedAssetsCount > 0
              ? 'Water stewardship layer can be derived from the current approved evidence set.'
              : 'Needs verified source evidence before water layer generation can proceed.'
            : 'Water layer is informational for this project configuration.',
      },
      {
        layerType: 'community-impact' as const,
        status: 'informational' as const,
        summary:
          memberCount > 0
            ? `${memberCount} approved cooperative participants are currently eligible for downstream package inclusion.`
            : 'No approved cooperative participants are currently eligible for package inclusion.',
      },
    ];
  };

  const syncVersionFromPlatformData = async (
    versionId: string,
    packageId: string,
    projectId: string,
    overrides?: {
      projectName?: string;
      projectGeography?: string;
      methodologyFit?: EcoStackProject['methodologyFit'];
      programType?: EcoStackProject['programType'];
      claimFocus?: EcoStackProject['claimFocus'];
      releasePeriod?: string;
    }
  ) => {
    if (!user || !orgId) return false;

    const now = new Date().toISOString();
    const versionRecord = versions.find((entry) => entry.id === versionId);
    const packageRecord = packages.find((entry) => entry.id === packageId);
    const projectRecord = projects.find((entry) => entry.id === projectId);
    const projectMetadata = {
      methodologyFit: overrides?.methodologyFit ?? projectRecord?.methodologyFit ?? 'ecostack-core',
      programType: overrides?.programType ?? projectRecord?.programType ?? 'stacked-credit',
      claimFocus: overrides?.claimFocus ?? projectRecord?.claimFocus ?? 'stacked',
    };
    const method = resolveMethodologyDefinition(projectMetadata.methodologyFit, projectMetadata.claimFocus);
    const methodologyId = versionRecord?.methodologyId ?? `methodology-${method.code.toLowerCase()}`;
    const modelRunId = versionRecord?.modelRunId ?? `${versionId}-model-run`;
    const projectName = overrides?.projectName ?? projectRecord?.name ?? 'EcoStack Cooperative Project';
    const projectGeography = overrides?.projectGeography ?? projectRecord?.geography ?? 'Cooperative portfolio';
    const releasePeriod = overrides?.releasePeriod ?? packageRecord?.releasePeriod ?? new Date().getFullYear().toString();

    const nextLayers = buildLayerBlueprint(projectName, projectMetadata);
    const nextSources = [
      {
        id: `${versionId}-org-orders`,
        sourceType: 'crm-order-records',
        sourceRecordId: 'org-orders',
        originSystem: 'foodcrm-pro',
      },
      ...eligibleMembers.flatMap((entry) => [
        {
          id: `${versionId}-member-${entry.member.userId}`,
          sourceType: 'coop-member-record',
          sourceRecordId: entry.member.userId,
          originSystem: 'data-coop',
        },
        {
          id: `${versionId}-verification-${entry.verification.id}`,
          sourceType: 'coop-verification-record',
          sourceRecordId: entry.verification.id,
          originSystem: 'data-coop',
        },
        {
          id: `${versionId}-permission-${entry.permission.id}`,
          sourceType: 'data-permission-record',
          sourceRecordId: entry.permission.id,
          originSystem: 'data-coop',
        },
        {
          id: `${versionId}-grant-${entry.accessGrant.id}`,
          sourceType: 'data-access-grant-record',
          sourceRecordId: entry.accessGrant.id,
          originSystem: 'data-coop',
        },
        ...entry.acceptedAssets.map((asset) => ({
          id: `${versionId}-asset-${asset.id}`,
          sourceType: 'accepted-data-asset',
          sourceRecordId: asset.id,
          originSystem: 'data-coop',
        })),
      ]),
    ];
    const nextTransformations = [
      {
        id: `${versionId}-eligibility-normalization`,
        transformationType: 'eligibility-normalization',
        methodVersion: 'ecostack-0.2.0',
        logicReference: 'approved-coop-member-gate',
      },
      {
        id: `${versionId}-lineage-assembly`,
        transformationType: 'lineage-assembly',
        methodVersion: 'ecostack-0.2.0',
        logicReference: 'platform-source-reference-builder',
      },
    ];
    const nextArtifactIds = [
      `${versionId}-buyer-summary`,
      `${versionId}-machine-json`,
      `${versionId}-evidence-index`,
    ];
    const nextArtifacts = [
      {
        id: `${versionId}-buyer-summary`,
        artifactType: 'buyer-summary' as const,
        title: 'Buyer Summary',
        summary: ecosystemReadiness.allRequiredLayersReady
          ? 'Human-readable diligence summary generated from approved cooperative records.'
          : 'Draft diligence summary generated from the currently approved cooperative records.',
        payload: buildBuyerSummaryPayload(projectName, projectGeography, releasePeriod, projectMetadata),
      },
      {
        id: `${versionId}-machine-json`,
        artifactType: 'machine-json' as const,
        title: 'Machine JSON',
        summary: 'Structured export generated from canonical package and lineage records.',
        payload: buildMachineJsonPayload(projectName, projectGeography, releasePeriod, projectMetadata),
      },
      {
        id: `${versionId}-evidence-index`,
        artifactType: 'evidence-index' as const,
        title: 'Evidence Index',
        summary: 'Traceable evidence inventory linked to the approved cooperative source set.',
        payload: buildEvidenceIndexPayload(projectName, releasePeriod, projectMetadata),
      },
    ];
    const nextCompletenessStatus =
      nextLayers.filter((entry) => entry.status !== 'informational').every((entry) => entry.status === 'ready')
        ? 'ready'
        : 'incomplete';

    const batch = writeBatch(db);

    batch.set(doc(db, `orgs/${orgId}/ecostack_methodologies`, methodologyId), {
      orgId,
      name: method.name,
      code: method.code,
      version: method.version,
      status: 'active',
      scope: method.scope,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    batch.set(doc(db, `orgs/${orgId}/ecostack_model_runs`, modelRunId), {
      orgId,
      packageVersionId: versionId,
      methodologyId,
      status: 'completed',
      eligibleMemberCount: ecosystemReadiness.eligibleMembersCount,
      acceptedAssetCount: ecosystemReadiness.acceptedAssetsCount,
      outputSummary:
        ecosystemReadiness.allRequiredLayersReady
          ? `Completed ${method.code} run for ${describeProgramType(projectMetadata.programType)} with ${ecosystemReadiness.eligibleMembersCount} eligible members and ${ecosystemReadiness.acceptedAssetsCount} accepted evidence assets.`
          : `Draft ${method.code} run only. ${ecosystemReadiness.eligibleMembersCount} eligible members and ${ecosystemReadiness.acceptedAssetsCount} accepted evidence assets are currently available for ${describeClaimFocus(projectMetadata.claimFocus)}.`,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    nextLayers.forEach((layer) => {
      batch.set(doc(db, `orgs/${orgId}/ecostack_layer_records`, `${versionId}-layer-${layer.layerType}`), {
        packageVersionId: versionId,
        layerType: layer.layerType,
        status: layer.status,
        summary: layer.summary,
        createdAt: now,
        updatedAt: now,
      });
    });

    nextSources.forEach((reference) => {
      batch.set(doc(db, `orgs/${orgId}/ecostack_source_references`, reference.id), {
        packageVersionId: versionId,
        sourceType: reference.sourceType,
        sourceRecordId: reference.sourceRecordId,
        originSystem: reference.originSystem,
        createdAt: now,
      });
    });

    nextTransformations.forEach((transformation) => {
      batch.set(doc(db, `orgs/${orgId}/ecostack_transformations`, transformation.id), {
        packageVersionId: versionId,
        transformationType: transformation.transformationType,
        methodVersion: transformation.methodVersion,
        logicReference: transformation.logicReference,
        createdAt: now,
      });
    });

    nextArtifacts.forEach((artifact) => {
      const existingArtifact = artifacts.find((entry) => entry.id === artifact.id);
      batch.set(doc(db, `orgs/${orgId}/ecostack_output_artifacts`, artifact.id), {
        packageVersionId: versionId,
        artifactType: artifact.artifactType,
        status: existingArtifact?.status === 'released' ? 'released' : 'draft',
        title: artifact.title,
        summary: artifact.summary,
        payload: artifact.payload,
        createdAt: existingArtifact?.createdAt ?? now,
        updatedAt: now,
      });
    });

    batch.set(doc(db, `orgs/${orgId}/ecostack_package_versions`, versionId), {
      orgId,
      packageId,
      projectId,
      methodologyId,
      modelRunId,
      versionNumber: versionRecord?.versionNumber ?? 1,
      status: versionRecord?.status ?? 'draft',
      completenessStatus: nextCompletenessStatus,
      generatedBy: versionRecord?.generatedBy ?? user.uid,
      reviewedBy: versionRecord?.reviewedBy ?? null,
      approvedBy: versionRecord?.approvedBy ?? null,
      releasedAt: versionRecord?.releasedAt ?? null,
      createdAt: versionRecord?.createdAt ?? now,
      updatedAt: now,
    }, { merge: true });

    batch.set(doc(db, `orgs/${orgId}/ecostack_packages`, packageId), {
      orgId,
      projectId,
      releasePeriod,
      status: packageRecord?.status ?? 'draft',
      currentVersionId: versionId,
      createdAt: packageRecord?.createdAt ?? now,
      updatedAt: now,
    }, { merge: true });

    batch.set(doc(db, `orgs/${orgId}/projects`, projectId), {
      orgId,
      name: projectName,
      geography: projectGeography,
      methodologyFit: projectMetadata.methodologyFit,
      programType: projectMetadata.programType,
      claimFocus: projectMetadata.claimFocus,
      status: 'active',
      createdAt: projectRecord?.createdAt ?? now,
      updatedAt: now,
    }, { merge: true });

    await batch.commit();

    await Promise.all([
      ...sources
        .filter((entry) => entry.packageVersionId === versionId)
        .filter((entry) => !nextSources.some((candidate) => candidate.id === entry.id))
        .map((entry) => deleteDoc(doc(db, `orgs/${orgId}/ecostack_source_references`, entry.id))),
      ...transformations
        .filter((entry) => entry.packageVersionId === versionId)
        .filter((entry) => !nextTransformations.some((candidate) => candidate.id === entry.id))
        .map((entry) => deleteDoc(doc(db, `orgs/${orgId}/ecostack_transformations`, entry.id))),
    ]);

    return nextCompletenessStatus === 'ready';
  };

  const createDraftPackage = async () => {
    if (!user || !orgId) return;
    if (selectedProjectId === 'new' && !draftProjectName.trim()) {
      setErrorMessage('Project name is required before creating a package.');
      return;
    }
    if (!draftReleasePeriod.trim()) {
      setErrorMessage('Release period is required before creating a package.');
      return;
    }

    const now = new Date().toISOString();
    const projectId = selectedProject?.id ?? `project-${Date.now()}`;
    const packageId = `package-${Date.now()}`;
    const versionId = `version-${Date.now()}`;
    const projectName = selectedProject?.name ?? draftProjectName.trim();
    const projectGeography = selectedProject?.geography ?? (draftProjectGeography.trim() || 'Cooperative portfolio');
    const methodologyFit = selectedProject?.methodologyFit ?? draftMethodologyFit;
    const programType = selectedProject?.programType ?? draftProgramType;
    const claimFocus = selectedProject?.claimFocus ?? draftClaimFocus;
    const releasePeriod = draftReleasePeriod.trim();

    setBusyAction('create-package');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await Promise.all([
        setDoc(doc(db, `orgs/${orgId}/projects`, projectId), {
          orgId,
          name: projectName,
          geography: projectGeography,
          methodologyFit,
          programType,
          claimFocus,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
        setDoc(doc(db, `orgs/${orgId}/ecostack_packages`, packageId), {
          orgId,
          projectId,
          releasePeriod,
          status: 'draft',
          currentVersionId: versionId,
          createdAt: now,
          updatedAt: now,
        }),
        setDoc(doc(db, `orgs/${orgId}/ecostack_package_versions`, versionId), {
          orgId,
          packageId,
          projectId,
          versionNumber: 1,
          status: 'draft',
          completenessStatus: 'incomplete',
          generatedBy: user.uid,
          reviewedBy: null,
          approvedBy: null,
          releasedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      ]);

      const ready = await syncVersionFromPlatformData(versionId, packageId, projectId, {
        projectName,
        projectGeography,
        methodologyFit,
        programType,
        claimFocus,
        releasePeriod,
      });

      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `EcoStack draft package for ${projectName} (${releasePeriod}) was created from canonical platform records${ready ? ' and is ready for review.' : '.'}`,
        orgId,
        recordId: versionId,
        recordType: 'ecostack-package-version',
      });
      setStatusMessage(
        ready
          ? 'EcoStack draft package created from approved Data Coop records and is ready for review.'
          : 'EcoStack draft package created. It is still waiting on more approved participation or accepted evidence before review.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create EcoStack draft package.');
    } finally {
      setBusyAction(null);
    }
  };

  const refreshPackageFromPlatformData = async () => {
    if (!user || !orgId || !currentVersion || !currentPackage) return;

    setBusyAction('refresh-package');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const ready = await syncVersionFromPlatformData(currentVersion.id, currentPackage.id, currentVersion.projectId);
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: 'EcoStack package version was refreshed from Data Coop and platform records.',
        orgId,
        recordId: currentVersion.id,
        recordType: 'ecostack-package-sync',
      });
      setStatusMessage(
        ready
          ? 'EcoStack package refreshed. All required layers are now ready.'
          : 'EcoStack package refreshed. Some required layers are still waiting on approved source records.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh EcoStack package.');
    } finally {
      setBusyAction(null);
    }
  };

  const saveSelectedProjectMetadata = async () => {
    if (!user || !orgId || !selectedProject) return;

    const now = new Date().toISOString();
    setBusyAction('save-project');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await setDoc(
        doc(db, `orgs/${orgId}/projects`, selectedProject.id),
        {
          orgId,
          name: draftProjectName.trim(),
          geography: draftProjectGeography.trim() || 'Cooperative portfolio',
          methodologyFit: draftMethodologyFit,
          programType: draftProgramType,
          claimFocus: draftClaimFocus,
          status: selectedProject.status || 'active',
          createdAt: selectedProject.createdAt ?? now,
          updatedAt: now,
        },
        { merge: true }
      );

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `EcoStack project metadata was updated for ${draftProjectName.trim()}.`,
        orgId,
        recordId: selectedProject.id,
        recordType: 'ecostack-project',
      });
      setStatusMessage('Project metadata updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update project metadata.');
    } finally {
      setBusyAction(null);
    }
  };

  const advanceVersion = async (nextStatus: Extract<EcoStackPackageVersion['status'], 'in_review' | 'approved' | 'released'>) => {
    if (!user || !orgId || !currentPackage || !currentVersion) return;
    const now = new Date().toISOString();
    setBusyAction(`advance-${nextStatus}`);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await Promise.all([
        setDoc(doc(db, `orgs/${orgId}/ecostack_package_versions`, currentVersion.id), {
          status: nextStatus,
          completenessStatus: nextStatus === 'in_review' ? 'ready' : currentVersion.completenessStatus,
          reviewedBy: nextStatus === 'approved' || nextStatus === 'released' ? user.uid : currentVersion.reviewedBy ?? null,
          approvedBy: nextStatus === 'approved' || nextStatus === 'released' ? user.uid : currentVersion.approvedBy ?? null,
          releasedAt: nextStatus === 'released' ? now : null,
          updatedAt: now,
        }, { merge: true }),
        setDoc(doc(db, `orgs/${orgId}/ecostack_packages`, currentPackage.id), {
          status: nextStatus === 'in_review' ? 'in_review' : nextStatus,
          updatedAt: now,
        }, { merge: true }),
        setDoc(doc(db, `orgs/${orgId}/ecostack_approval_records`, `${currentVersion.id}-${nextStatus}`), {
          packageVersionId: currentVersion.id,
          action: nextStatus === 'in_review' ? 'submitted' : nextStatus,
          actorUserId: user.uid,
          actorEmail: user.email || null,
          notes:
            nextStatus === 'in_review'
              ? 'Package moved into review.'
              : nextStatus === 'approved'
                ? 'Package approved for release.'
                : 'Package released.',
          createdAt: now,
        }),
        ...(nextStatus === 'released'
          ? currentVersionArtifacts.map((artifact) =>
              setDoc(doc(db, `orgs/${orgId}/ecostack_output_artifacts`, artifact.id), {
                status: 'released',
              }, { merge: true })
            )
          : []),
      ]);

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `EcoStack package version moved to ${nextStatus}.`,
        orgId,
        recordId: currentVersion.id,
        recordType: 'ecostack-package-workflow',
      });
      setStatusMessage(`EcoStack package moved to ${nextStatus}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update EcoStack package state.');
    } finally {
      setBusyAction(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(132,204,22,0.15),_transparent_32%),linear-gradient(180deg,_#08111f,_#0f172a)] px-4 py-10 text-white">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/6 p-10 text-center shadow-[0_30px_120px_-40px_rgba(15,23,42,0.7)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-lime-400/15 text-lime-200">
            <Leaf className="h-8 w-8" />
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight">Enter EcoStack</h1>
          <p className="mt-4 text-sm leading-7 text-slate-200/85">
            Assemble lineage-preserving environmental asset packages from the Merge ecosystem.
          </p>
          <button
            onClick={() => login()}
            className="mt-8 rounded-full bg-white px-6 py-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const buyerSummaryArtifact = currentVersionArtifacts.find((entry) => entry.artifactType === 'buyer-summary');
  const machineJsonArtifact = currentVersionArtifacts.find((entry) => entry.artifactType === 'machine-json');
  const evidenceIndexArtifact = currentVersionArtifacts.find((entry) => entry.artifactType === 'evidence-index');
  const parsedMachineJson = useMemo(() => {
    if (!machineJsonArtifact?.payload) return null;

    try {
      return JSON.parse(machineJsonArtifact.payload) as {
        externalExports?: {
          buyerPackage?: unknown;
          registrySubmissionDraft?: unknown;
        };
      };
    } catch {
      return null;
    }
  }, [machineJsonArtifact?.payload]);
  const registryExportDraft = parsedMachineJson?.externalExports?.registrySubmissionDraft ?? null;

  const downloadArtifactPayload = (
    fileName: string,
    payload: string,
    mimeType: string,
  ) => {
    const blob = new Blob([payload], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(132,204,22,0.15),_transparent_32%),linear-gradient(180deg,_#08111f,_#0f172a)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6 shadow-[0_30px_120px_-40px_rgba(15,23,42,0.6)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-lime-200/70">EcoStack</div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Asset Generator Workspace</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200/80">
            EcoStack now derives package readiness from approved cooperative participation, accepted evidence, active permissions, and downstream access grants.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Where you are</div>
              <div className="mt-2 text-base font-semibold text-white">{presentPackageStatus(currentPackage?.status)}</div>
              <div className="mt-1 text-sm text-slate-300">{presentCompleteness(currentVersion?.completenessStatus)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">What is driving readiness</div>
              <div className="mt-2 text-base font-semibold text-white">{ecosystemReadiness.eligibleMembersCount} approved participants</div>
              <div className="mt-1 text-sm text-slate-300">{ecosystemReadiness.acceptedAssetsCount} accepted evidence assets</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Recommended next action</div>
              <div className="mt-2 text-sm font-medium leading-6 text-slate-100">{nextRecommendedAction}</div>
            </div>
          </div>
          {launchMessage ? <div className="mt-4 rounded-2xl border border-emerald-200/50 bg-emerald-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900">{launchMessage}</div> : null}
          {statusMessage ? <div className="mt-4 rounded-2xl border border-lime-200/50 bg-lime-50 px-4 py-3 text-sm text-lime-950">{statusMessage}</div> : null}
          {errorMessage ? <div className="mt-4 rounded-2xl border border-rose-200/50 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</div> : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Current Package State</h2>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Project</div>
                <div className="mt-2 text-lg font-semibold">{currentProject?.name || 'No project yet'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Release Period</div>
                <div className="mt-2 text-lg font-semibold">{currentPackage?.releasePeriod || 'Not started'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Package Status</div>
                <div className="mt-2 text-lg font-semibold">{presentPackageStatus(currentPackage?.status)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Version</div>
                <div className="mt-2 text-lg font-semibold">{currentVersion ? `v${currentVersion.versionNumber}` : 'No version'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Completeness</div>
                <div className="mt-2 text-lg font-semibold">{presentCompleteness(currentVersion?.completenessStatus)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Outputs</div>
                <div className="mt-2 text-lg font-semibold">{currentVersionArtifacts.length} staged</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Eligible Members</div>
                <div className="mt-2 text-lg font-semibold">{ecosystemReadiness.eligibleMembersCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Accepted Evidence</div>
                <div className="mt-2 text-lg font-semibold">{ecosystemReadiness.acceptedAssetsCount}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Methodology</div>
                <div className="mt-2 text-lg font-semibold">{currentMethodology ? `${currentMethodology.code} v${currentMethodology.version}` : 'Not assigned'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Model Run</div>
                <div className="mt-2 text-lg font-semibold">{currentModelRun?.status || 'Not run yet'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Methodology Fit</div>
                <div className="mt-2 text-lg font-semibold">{presentMethodologyFit(currentProject?.methodologyFit)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Program Type</div>
                <div className="mt-2 text-lg font-semibold">{presentProgramType(currentProject?.programType)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Claim Focus</div>
                <div className="mt-2 text-lg font-semibold">{presentClaimFocus(currentProject?.claimFocus)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Geography</div>
                <div className="mt-2 text-lg font-semibold">{currentProject?.geography || 'Not set'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Operator Workflow</h2>
            </div>
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Readiness checklist</div>
                <div className="mt-4 space-y-3">
                  {workflowChecklist.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{item.label}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-300">{item.detail}</div>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${item.ready ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>
                          {item.ready ? 'Ready' : 'Needs work'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Step 1: Project setup</div>
                <div className="mt-4 space-y-3">
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Use project</span>
                    <select
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    >
                      <option value="new">Create new project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Project name</span>
                    <input
                      value={draftProjectName}
                      onChange={(event) => setDraftProjectName(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Geography</span>
                    <input
                      value={draftProjectGeography}
                      onChange={(event) => setDraftProjectGeography(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Methodology fit</span>
                    <select
                      value={draftMethodologyFit}
                      onChange={(event) => setDraftMethodologyFit(event.target.value as EcoStackProject['methodologyFit'])}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    >
                      {METHODOLOGY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Program type</span>
                    <select
                      value={draftProgramType}
                      onChange={(event) => setDraftProgramType(event.target.value as EcoStackProject['programType'])}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    >
                      {PROGRAM_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Claim focus</span>
                    <select
                      value={draftClaimFocus}
                      onChange={(event) => setDraftClaimFocus(event.target.value as EcoStackProject['claimFocus'])}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    >
                      {CLAIM_FOCUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {selectedProject ? (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void saveSelectedProjectMetadata()}
                      className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-sm font-semibold text-white transition hover:bg-white/12 disabled:opacity-60"
                    >
                      {busyAction === 'save-project' ? 'Saving project...' : 'Save Project Metadata'}
                    </button>
                  ) : null}
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Release period</span>
                    <input
                      value={draftReleasePeriod}
                      onChange={(event) => setDraftReleasePeriod(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm leading-6 text-slate-200">
                EcoStack can only move forward when the platform can prove approved participation, active downstream use rights, and accepted evidence. If a button is disabled below, the checklist above is telling us what still needs attention.
              </div>
              {!currentVersion ? (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void createDraftPackage()}
                  className="w-full rounded-2xl bg-lime-300 px-4 py-4 text-sm font-semibold text-lime-950 transition hover:bg-lime-200 disabled:opacity-60"
                >
                  {busyAction === 'create-package' ? 'Creating package...' : 'Step 2: Create Draft Package'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void refreshPackageFromPlatformData()}
                    className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-sm font-semibold text-white transition hover:bg-white/12 disabled:opacity-60"
                  >
                    {busyAction === 'refresh-package' ? 'Refreshing...' : 'Step 2: Refresh From Approved Data'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null || currentVersion.status !== 'draft' || currentVersion.completenessStatus !== 'ready'}
                    onClick={() => void advanceVersion('in_review')}
                    className="w-full rounded-2xl bg-lime-300 px-4 py-4 text-sm font-semibold text-lime-950 transition hover:bg-lime-200 disabled:opacity-60"
                  >
                    {busyAction === 'advance-in_review' ? 'Submitting...' : 'Step 3: Move To Review'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null || currentVersion.status !== 'in_review' || !canAdmin}
                    onClick={() => void advanceVersion('approved')}
                    className="w-full rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {busyAction === 'advance-approved' ? 'Approving...' : 'Step 4: Approve Package'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null || currentVersion.status !== 'approved' || !canAdmin}
                    onClick={() => void advanceVersion('released')}
                    className="w-full rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {busyAction === 'advance-released' ? 'Releasing...' : 'Step 5: Release Package'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <Leaf className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Layer Assembly</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {currentVersionLayers.length ? currentVersionLayers.map((layer) => (
                <div key={layer.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                  <div className="text-lg font-semibold">{layer.layerType}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{layer.status}</div>
                  <div className="mt-2 text-sm text-slate-300">{layer.summary}</div>
                </div>
              )) : <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-slate-300">No EcoStack layers yet.</div>}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Lineage Backbone</h2>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Source references</div>
                <div className="mt-2 text-lg font-semibold">{currentVersionSources.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Transformations</div>
                <div className="mt-2 text-lg font-semibold">{currentVersionTransformations.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Approval records</div>
                <div className="mt-2 text-lg font-semibold">{currentVersionApprovals.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Approved Coop Inputs</div>
                <div className="mt-2 text-sm text-slate-300">
                  {eligibleMembers.length
                    ? eligibleMembers
                        .slice(0, 3)
                        .map((entry) => entry.member.operationName || entry.member.displayName || entry.member.email || entry.member.userId)
                        .join(', ')
                    : 'No approved cooperative participants are ready yet.'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Model Output</div>
                <div className="mt-2 text-sm text-slate-300">
                  {currentModelRun?.outputSummary || 'No model output summary yet.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
          <div className="flex items-center gap-3">
            <Boxes className="h-5 w-5 text-lime-200" />
            <h2 className="text-xl font-semibold">Project History</h2>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Packages</div>
              <div className="mt-4 grid gap-3">
                {visibleProjectPackages.length ? visibleProjectPackages.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setActivePackageId(entry.id);
                      setActiveVersionId(entry.currentVersionId ?? null);
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${currentPackage?.id === entry.id ? 'border-lime-300/60 bg-lime-300/10' : 'border-white/10 bg-slate-950/30 hover:bg-slate-950/45'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{entry.releasePeriod}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {currentPackage?.id === entry.id ? 'Viewing' : 'Open'}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{presentPackageStatus(entry.status)}</div>
                  </button>
                )) : <div className="text-sm text-slate-300">No packages yet for the current project.</div>}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Version History</div>
              <div className="mt-4 grid gap-3">
                {visibleProjectVersions.length ? visibleProjectVersions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setActiveVersionId(entry.id);
                      setActivePackageId(entry.packageId);
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${currentVersion?.id === entry.id ? 'border-lime-300/60 bg-lime-300/10' : 'border-white/10 bg-slate-950/30 hover:bg-slate-950/45'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">v{entry.versionNumber}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {currentVersion?.id === entry.id ? 'Viewing' : 'Open'}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{presentPackageStatus(entry.status)} • {presentCompleteness(entry.completenessStatus)}</div>
                  </button>
                )) : <div className="text-sm text-slate-300">No versions yet for the current project.</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Buyer Package</h2>
            </div>
            <div className="mt-6 text-sm leading-6 text-slate-300">
              {buyerSummaryArtifact?.summary || 'Human-readable diligence package that summarizes approved cooperative participation, active permissions, and defensible source lineage.'}
            </div>
            {buyerSummaryArtifact?.payload ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => downloadArtifactPayload(`ecostack-buyer-summary-${currentPackage?.releasePeriod || 'draft'}.txt`, buyerSummaryArtifact.payload || '', 'text/plain;charset=utf-8')}
                  className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/12"
                >
                  Download TXT
                </button>
              </div>
            ) : null}
            {buyerSummaryArtifact?.payload ? (
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-6 text-slate-200 whitespace-pre-wrap">
                {buyerSummaryArtifact.payload}
              </pre>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <FileJson className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Machine JSON</h2>
            </div>
            <div className="mt-6 text-sm leading-6 text-slate-300">
              {machineJsonArtifact?.summary || 'Structured export for APIs, marketplaces, and downstream analytics built from canonical package and lineage records.'}
            </div>
            {machineJsonArtifact?.payload ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => downloadArtifactPayload(`ecostack-machine-json-${currentPackage?.releasePeriod || 'draft'}.json`, machineJsonArtifact.payload || '', 'application/json;charset=utf-8')}
                  className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/12"
                >
                  Download JSON
                </button>
              </div>
            ) : null}
            {machineJsonArtifact?.payload ? (
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-6 text-slate-200 whitespace-pre-wrap">
                {machineJsonArtifact.payload}
              </pre>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-lime-200" />
              <h2 className="text-xl font-semibold">Evidence Index</h2>
            </div>
            <div className="mt-6 text-sm leading-6 text-slate-300">
              {evidenceIndexArtifact?.summary || 'Audit bundle linking each released claim back to cooperative agreements, verification, evidence, permissions, and transforms.'}
            </div>
            {evidenceIndexArtifact?.payload ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => downloadArtifactPayload(`ecostack-evidence-index-${currentPackage?.releasePeriod || 'draft'}.txt`, evidenceIndexArtifact.payload || '', 'text/plain;charset=utf-8')}
                  className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/12"
                >
                  Download TXT
                </button>
              </div>
            ) : null}
            {evidenceIndexArtifact?.payload ? (
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-6 text-slate-200 whitespace-pre-wrap">
                {evidenceIndexArtifact.payload}
              </pre>
            ) : null}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
          <div className="flex items-center gap-3">
            <FileJson className="h-5 w-5 text-lime-200" />
            <h2 className="text-xl font-semibold">Registry Export Preview</h2>
          </div>
          <div className="mt-6 text-sm leading-6 text-slate-300">
            First-class preview of the registry-facing export draft generated from the current methodology, model run, project metadata, and approved cooperative records.
          </div>
          {registryExportDraft ? (
            <>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => downloadArtifactPayload(`ecostack-registry-export-${currentPackage?.releasePeriod || 'draft'}.json`, JSON.stringify(registryExportDraft, null, 2), 'application/json;charset=utf-8')}
                  className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/12"
                >
                  Download Registry JSON
                </button>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-6 text-slate-200 whitespace-pre-wrap">
                {JSON.stringify(registryExportDraft, null, 2)}
              </pre>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-4 text-sm text-slate-300">
              Create or refresh a package to generate the first registry export draft.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
