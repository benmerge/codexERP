import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useSearchParams } from 'react-router-dom';
import { db, storage } from '../firebase';
import { useAppContext } from '../data/AppContext';
import { crmAppConfig } from '../config';
import { consumeToolLaunchSession, resolveToolLaunchSession } from '../platform/launch';
import { writePlatformEvent } from '../platform/data';
import { canManagePlatform, resolveOrgId } from '../platform/shared';

type CoopMemberStatus = 'invited' | 'enrolling' | 'pending_review' | 'active' | 'needs_changes';
type VerificationStatus = 'not_started' | 'submitted' | 'approved' | 'rejected' | 'needs_changes';
type DataAssetStatus = 'required' | 'submitted' | 'accepted';
type DataPermissionStatus = 'granted' | 'revoked' | 'pending';
type DataAccessGrantStatus = 'active' | 'pending' | 'expired';
type DataRequestStatus = 'open' | 'submitted' | 'completed';

type CoopMemberRecord = {
  id: string;
  userId: string;
  orgId: string;
  displayName?: string;
  email?: string;
  memberType?: string;
  status?: CoopMemberStatus;
  plan?: string;
  joinedAt?: string | null;
  approvedAt?: string | null;
  defaultHome?: string;
  operationName?: string;
  createdAt?: string;
  updatedAt?: string;
};

type CoopAgreementRecord = {
  id: string;
  memberId: string;
  agreementType: string;
  agreementVersion: string;
  status: 'required' | 'signed';
  signedAt?: string | null;
  signedByUserId?: string | null;
  plan?: string | null;
  documentRef?: string | null;
  title?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CoopVerificationRecord = {
  id: string;
  memberId: string;
  type: string;
  status: VerificationStatus;
  reviewerUserId?: string | null;
  evidenceRefs?: string[];
  submittedAt?: string | null;
  reviewedAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DataPermissionRecord = {
  id: string;
  memberId: string;
  scope: string;
  purpose: string;
  status: DataPermissionStatus;
  grantedAt?: string | null;
  revokedAt?: string | null;
  agreementVersion?: string | null;
  programId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DataAccessGrantRecord = {
  id: string;
  memberId: string;
  programId: string;
  buyerId?: string | null;
  dataTypes: string[];
  status: DataAccessGrantStatus;
  grantedAt?: string | null;
  expiresAt?: string | null;
  linkedPermissionIds?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type DataRequestRecord = {
  id: string;
  memberId: string;
  type: string;
  status: DataRequestStatus;
  title: string;
  description: string;
  dueAt?: string | null;
  requestedBy?: string | null;
  targetProgram?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DataAssetRecord = {
  id: string;
  memberId: string;
  assetType: string;
  title: string;
  status: DataAssetStatus;
  notes?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  storagePath?: string | null;
  downloadUrl?: string | null;
  uploadedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const DEFAULT_AGREEMENTS = [
  {
    id: 'coop-membership',
    agreementType: 'coop-membership',
    agreementVersion: '1.0.0',
    title: 'Cooperative Membership Agreement',
  },
  {
    id: 'data-rights',
    agreementType: 'data-rights',
    agreementVersion: '1.0.0',
    title: 'Data Rights and Revenue Participation Agreement',
  },
];

const REQUIRED_ASSETS = [
  {
    id: 'operation-profile',
    assetType: 'operation-profile',
    title: 'Operation profile and acreage summary',
  },
  {
    id: 'ownership-proof',
    assetType: 'ownership-proof',
    title: 'Ownership or participation proof',
  },
];

const DEFAULT_REQUESTS = [
  {
    id: 'verification-evidence',
    type: 'verification',
    title: 'Complete verification evidence package',
    description: 'Submit the required operation profile and participation proof so internal review can begin.',
    targetProgram: 'Data Coop',
  },
  {
    id: 'data-sharing-readiness',
    type: 'consent',
    title: 'Confirm cooperative data-sharing readiness',
    description: 'Grant the baseline cooperative data permission used for MiData and future downstream programs.',
    targetProgram: 'MiData',
  },
];

const verificationLabels: Record<VerificationStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted for review',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_changes: 'Needs changes',
};

const memberStatusLabels: Record<CoopMemberStatus, string> = {
  invited: 'Invited',
  enrolling: 'Enrolling',
  pending_review: 'Pending review',
  active: 'Active',
  needs_changes: 'Needs changes',
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '-');

export function DataCoopHome() {
  const { user, login } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [member, setMember] = useState<CoopMemberRecord | null>(null);
  const [agreements, setAgreements] = useState<CoopAgreementRecord[]>([]);
  const [verification, setVerification] = useState<CoopVerificationRecord | null>(null);
  const [assets, setAssets] = useState<DataAssetRecord[]>([]);
  const [requests, setRequests] = useState<DataRequestRecord[]>([]);
  const [permissions, setPermissions] = useState<DataPermissionRecord[]>([]);
  const [accessGrants, setAccessGrants] = useState<DataAccessGrantRecord[]>([]);
  const [orgMembers, setOrgMembers] = useState<CoopMemberRecord[]>([]);
  const [allVerifications, setAllVerifications] = useState<CoopVerificationRecord[]>([]);
  const [allAssets, setAllAssets] = useState<DataAssetRecord[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const orgId = resolveOrgId(user, crmAppConfig.sharedOrgId);
  const memberId = user?.uid ?? null;
  const canAdmin = canManagePlatform(user?.email);

  useEffect(() => {
    const launchId = searchParams.get('launchId');
    if (!launchId || !user || !orgId) return;

    let isMounted = true;

    void (async () => {
      const launch = await resolveToolLaunchSession({
        db,
        launchId,
        orgId,
      });

      if (!launch || launch.toolId !== 'data-coop' || launch.userId !== user.uid) return;

      await consumeToolLaunchSession({
        db,
        launchId,
        orgId,
      });

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
    if (!orgId || !memberId) {
      setMember(null);
      setAgreements([]);
      setVerification(null);
      setAssets([]);
      setRequests([]);
      setPermissions([]);
      setAccessGrants([]);
      setOrgMembers([]);
      setAllVerifications([]);
      setAllAssets([]);
      return;
    }

    const unsubscribeMember = onSnapshot(doc(db, `orgs/${orgId}/coop_members`, memberId), (snapshot) => {
      setMember(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as CoopMemberRecord) : null);
    });

    const unsubscribeAgreements = onSnapshot(collection(db, `orgs/${orgId}/coop_agreements`), (snapshot) => {
      setAgreements(
        snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as CoopAgreementRecord))
          .filter((entry) => entry.memberId === memberId)
      );
    });

    const unsubscribeVerifications = onSnapshot(collection(db, `orgs/${orgId}/coop_verifications`), (snapshot) => {
      const records = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CoopVerificationRecord));
      setVerification(records.find((entry) => entry.memberId === memberId) ?? null);
      if (canAdmin) {
        setAllVerifications(records);
      }
    });

    const unsubscribeAssets = onSnapshot(collection(db, `orgs/${orgId}/data_assets`), (snapshot) => {
      const records = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as DataAssetRecord));
      setAssets(records.filter((entry) => entry.memberId === memberId));
      if (canAdmin) {
        setAllAssets(records);
      }
    });

    const unsubscribeRequests = onSnapshot(collection(db, `orgs/${orgId}/data_requests`), (snapshot) => {
      setRequests(
        snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as DataRequestRecord))
          .filter((entry) => entry.memberId === memberId)
      );
    });

    const unsubscribePermissions = onSnapshot(collection(db, `orgs/${orgId}/data_permissions`), (snapshot) => {
      setPermissions(
        snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as DataPermissionRecord))
          .filter((entry) => entry.memberId === memberId)
      );
    });

    const unsubscribeAccessGrants = onSnapshot(collection(db, `orgs/${orgId}/data_access_grants`), (snapshot) => {
      setAccessGrants(
        snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as DataAccessGrantRecord))
          .filter((entry) => entry.memberId === memberId)
      );
    });

    let unsubscribeOrgMembers = () => {};
    if (canAdmin) {
      unsubscribeOrgMembers = onSnapshot(collection(db, `orgs/${orgId}/coop_members`), (snapshot) => {
        setOrgMembers(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CoopMemberRecord)));
      });
    }

    return () => {
      unsubscribeMember();
      unsubscribeAgreements();
      unsubscribeVerifications();
      unsubscribeAssets();
      unsubscribeRequests();
      unsubscribePermissions();
      unsubscribeAccessGrants();
      unsubscribeOrgMembers();
    };
  }, [canAdmin, memberId, orgId]);

  const signedAgreementCount = agreements.filter((entry) => entry.status === 'signed').length;
  const requiredAgreementCount = DEFAULT_AGREEMENTS.length;
  const submittedAssetCount = assets.filter((entry) => entry.status === 'submitted' || entry.status === 'accepted').length;
  const requiredAssetCount = REQUIRED_ASSETS.length;
  const activePermission = permissions.find((entry) => entry.status === 'granted');
  const openRequestCount = requests.filter((entry) => entry.status !== 'completed').length;
  const verificationReady =
    signedAgreementCount === requiredAgreementCount &&
    submittedAssetCount === requiredAssetCount &&
    !!activePermission;

  const reviewQueue = useMemo(
    () =>
      allVerifications
        .filter((entry) => entry.status === 'submitted')
        .map((entry) => ({
          verification: entry,
          member: orgMembers.find((candidate) => candidate.userId === entry.memberId),
          assets: allAssets.filter((asset) => asset.memberId === entry.memberId),
        })),
    [allAssets, allVerifications, orgMembers]
  );

  const setBusy = (action: string | null) => {
    setBusyAction(action);
    if (action) {
      setErrorMessage(null);
      setStatusMessage(null);
    }
  };

  const initializeMembership = async () => {
    if (!user || !orgId || !memberId) return;

    const now = new Date().toISOString();
    setBusy('initialize');
    try {
      await setDoc(
        doc(db, `orgs/${orgId}/coop_members`, memberId),
        {
          id: memberId,
          userId: memberId,
          orgId,
          displayName: user.displayName || user.email || 'Coop Member',
          email: user.email || '',
          memberType: 'farmer-owner',
          status: 'enrolling',
          plan: 'annual-membership',
          joinedAt: now,
          approvedAt: null,
          defaultHome: 'data-coop',
          operationName: '',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await Promise.all([
        ...DEFAULT_AGREEMENTS.map((agreement) =>
          setDoc(
            doc(db, `orgs/${orgId}/coop_agreements`, `${memberId}-${agreement.id}`),
            {
              memberId,
              agreementType: agreement.agreementType,
              agreementVersion: agreement.agreementVersion,
              status: 'required',
              signedAt: null,
              signedByUserId: null,
              plan: 'annual-membership',
              documentRef: agreement.id,
              title: agreement.title,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          )
        ),
        ...REQUIRED_ASSETS.map((asset) =>
          setDoc(
            doc(db, `orgs/${orgId}/data_assets`, `${memberId}-${asset.id}`),
            {
              memberId,
              assetType: asset.assetType,
              title: asset.title,
              status: 'required',
              notes: 'Awaiting member upload.',
              submittedAt: null,
              reviewedAt: null,
              fileName: null,
              contentType: null,
              sizeBytes: null,
              storagePath: null,
              downloadUrl: null,
              uploadedBy: null,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          )
        ),
        ...DEFAULT_REQUESTS.map((request) =>
          setDoc(
            doc(db, `orgs/${orgId}/data_requests`, `${memberId}-${request.id}`),
            {
              memberId,
              type: request.type,
              status: 'open',
              title: request.title,
              description: request.description,
              dueAt: null,
              requestedBy: 'Merge OS',
              targetProgram: request.targetProgram,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          )
        ),
        setDoc(
          doc(db, `orgs/${orgId}/coop_verifications`, `${memberId}-eligibility`),
          {
            memberId,
            type: 'eligibility',
            status: 'not_started',
            reviewerUserId: null,
            evidenceRefs: [],
            submittedAt: null,
            reviewedAt: null,
            notes: 'Submit required agreements, consent, and evidence to begin review.',
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);

      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: 'Data Coop membership was initialized for the member.',
        orgId,
        recordId: memberId,
        recordType: 'coop-member',
      });
      setStatusMessage('Membership initialized. Next up: sign agreements, grant data permission, and upload verification evidence.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to initialize membership.');
    } finally {
      setBusy(null);
    }
  };

  const signAgreements = async () => {
    if (!user || !orgId || !memberId) return;

    const now = new Date().toISOString();
    setBusy('agreements');
    try {
      await Promise.all(
        DEFAULT_AGREEMENTS.map((agreement) =>
          setDoc(
            doc(db, `orgs/${orgId}/coop_agreements`, `${memberId}-${agreement.id}`),
            {
              memberId,
              agreementType: agreement.agreementType,
              agreementVersion: agreement.agreementVersion,
              status: 'signed',
              signedAt: now,
              signedByUserId: memberId,
              plan: member?.plan ?? 'annual-membership',
              documentRef: agreement.id,
              title: agreement.title,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          )
        )
      );

      await setDoc(doc(db, `orgs/${orgId}/coop_members`, memberId), { status: 'enrolling', updatedAt: now }, { merge: true });

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: 'Data Coop agreements were signed by the member.',
        orgId,
        recordId: memberId,
        recordType: 'coop-agreement',
      });
      setStatusMessage('Required agreements signed. Next up: grant baseline data permission and upload evidence.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign agreements.');
    } finally {
      setBusy(null);
    }
  };

  const handleFileSelection = (assetId: string, file: File | null) => {
    setSelectedFiles((current) => ({
      ...current,
      [assetId]: file,
    }));
  };

  const uploadEvidenceAsset = async (asset: { id: string; assetType: string; title: string }) => {
    if (!user || !orgId || !memberId) return;
    const file = selectedFiles[asset.id];
    if (!file) {
      setErrorMessage(`Choose a file for ${asset.title} first.`);
      return;
    }

    const now = new Date().toISOString();
    const storagePath = `orgs/${orgId}/data-assets/${memberId}/${asset.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
    setBusy(`upload-${asset.id}`);
    try {
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, {
        contentType: file.type || 'application/octet-stream',
      });
      const downloadUrl = await getDownloadURL(storageRef);

      await setDoc(
        doc(db, `orgs/${orgId}/data_assets`, `${memberId}-${asset.id}`),
        {
          memberId,
          assetType: asset.assetType,
          title: asset.title,
          status: 'submitted',
          notes: 'Uploaded from the Data Coop evidence flow.',
          submittedAt: now,
          reviewedAt: null,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          storagePath,
          downloadUrl,
          uploadedBy: memberId,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, `orgs/${orgId}/data_requests`, `${memberId}-verification-evidence`),
        {
          memberId,
          type: 'verification',
          status: 'submitted',
          title: 'Complete verification evidence package',
          description: 'Submit the required operation profile and participation proof so internal review can begin.',
          dueAt: null,
          requestedBy: 'Merge OS',
          targetProgram: 'Data Coop',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `Data Coop evidence uploaded: ${asset.title}.`,
        orgId,
        recordId: `${memberId}-${asset.id}`,
        recordType: 'data-asset',
      });

      handleFileSelection(asset.id, null);
      setStatusMessage(`${asset.title} uploaded successfully.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to upload evidence.');
    } finally {
      setBusy(null);
    }
  };

  const grantBaselinePermission = async () => {
    if (!user || !orgId || !memberId) return;

    const now = new Date().toISOString();
    setBusy('grant-permission');
    try {
      await setDoc(
        doc(db, `orgs/${orgId}/data_permissions`, `${memberId}-coop-baseline`),
        {
          memberId,
          scope: 'cooperative-data-use',
          purpose: 'MiData participation and downstream program preparation',
          status: 'granted',
          grantedAt: now,
          revokedAt: null,
          agreementVersion: DEFAULT_AGREEMENTS[1].agreementVersion,
          programId: 'mida-core',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, `orgs/${orgId}/data_requests`, `${memberId}-data-sharing-readiness`),
        {
          memberId,
          type: 'consent',
          status: 'completed',
          title: 'Confirm cooperative data-sharing readiness',
          description: 'Grant the baseline cooperative data permission used for MiData and future downstream programs.',
          dueAt: null,
          requestedBy: 'Merge OS',
          targetProgram: 'MiData',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: 'Baseline Data Coop data permission was granted by the member.',
        orgId,
        recordId: `${memberId}-coop-baseline`,
        recordType: 'data-permission',
      });
      setStatusMessage('Baseline cooperative data permission granted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to grant data permission.');
    } finally {
      setBusy(null);
    }
  };

  const revokeBaselinePermission = async () => {
    if (!user || !orgId || !memberId) return;

    const now = new Date().toISOString();
    setBusy('revoke-permission');
    try {
      await Promise.all([
        setDoc(
          doc(db, `orgs/${orgId}/data_permissions`, `${memberId}-coop-baseline`),
          {
            memberId,
            scope: 'cooperative-data-use',
            purpose: 'MiData participation and downstream program preparation',
            status: 'revoked',
            grantedAt: activePermission?.grantedAt ?? null,
            revokedAt: now,
            agreementVersion: DEFAULT_AGREEMENTS[1].agreementVersion,
            programId: 'mida-core',
            createdAt: activePermission?.createdAt ?? now,
            updatedAt: now,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, `orgs/${orgId}/data_access_grants`, `${memberId}-mida-core`),
          {
            memberId,
            programId: 'mida-core',
            buyerId: null,
            dataTypes: ['profile', 'verification', 'participation'],
            status: 'expired',
            grantedAt: accessGrants.find((grant) => grant.id === `${memberId}-mida-core`)?.grantedAt ?? null,
            expiresAt: now,
            linkedPermissionIds: [`${memberId}-coop-baseline`],
            createdAt: accessGrants.find((grant) => grant.id === `${memberId}-mida-core`)?.createdAt ?? now,
            updatedAt: now,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, `orgs/${orgId}/data_requests`, `${memberId}-data-sharing-readiness`),
          {
            memberId,
            type: 'consent',
            status: 'open',
            title: 'Confirm cooperative data-sharing readiness',
            description: 'Grant the baseline cooperative data permission used for MiData and future downstream programs.',
            dueAt: null,
            requestedBy: 'Merge OS',
            targetProgram: 'MiData',
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: 'Baseline Data Coop data permission was revoked by the member.',
        orgId,
        recordId: `${memberId}-coop-baseline`,
        recordType: 'data-permission',
      });
      setStatusMessage('Baseline cooperative data permission revoked.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to revoke data permission.');
    } finally {
      setBusy(null);
    }
  };

  const submitVerification = async () => {
    if (!user || !orgId || !memberId || !verificationReady) return;

    const now = new Date().toISOString();
    const evidenceRefs = REQUIRED_ASSETS.map((asset) => `${memberId}-${asset.id}`);
    setBusy('verification-submit');
    try {
      await setDoc(
        doc(db, `orgs/${orgId}/coop_verifications`, `${memberId}-eligibility`),
        {
          memberId,
          type: 'eligibility',
          status: 'submitted',
          reviewerUserId: null,
          evidenceRefs,
          submittedAt: now,
          reviewedAt: null,
          notes: 'Ready for internal cooperative review.',
          createdAt: verification?.createdAt ?? now,
          updatedAt: now,
        },
        { merge: true }
      );

      await setDoc(doc(db, `orgs/${orgId}/coop_members`, memberId), { status: 'pending_review', updatedAt: now }, { merge: true });

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: 'Data Coop verification package was submitted for review.',
        orgId,
        recordId: `${memberId}-eligibility`,
        recordType: 'coop-verification',
      });
      setStatusMessage('Verification package submitted for internal review.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit verification.');
    } finally {
      setBusy(null);
    }
  };

  const reviewVerification = async (targetMemberId: string, nextStatus: Extract<VerificationStatus, 'approved' | 'needs_changes'>) => {
    if (!user || !orgId || !canAdmin) return;

    const now = new Date().toISOString();
    const targetVerification = allVerifications.find((entry) => entry.memberId === targetMemberId);
    setBusy(`review-${targetMemberId}-${nextStatus}`);
    try {
      await setDoc(
        doc(db, `orgs/${orgId}/coop_verifications`, `${targetMemberId}-eligibility`),
        {
          memberId: targetMemberId,
          type: 'eligibility',
          status: nextStatus,
          reviewerUserId: user.uid,
          evidenceRefs: targetVerification?.evidenceRefs ?? REQUIRED_ASSETS.map((asset) => `${targetMemberId}-${asset.id}`),
          submittedAt: targetVerification?.submittedAt ?? now,
          reviewedAt: now,
          notes:
            nextStatus === 'approved'
              ? 'Verification approved by platform admin.'
              : 'Additional changes requested before approval.',
          createdAt: targetVerification?.createdAt ?? now,
          updatedAt: now,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, `orgs/${orgId}/coop_members`, targetMemberId),
        {
          status: nextStatus === 'approved' ? 'active' : 'needs_changes',
          approvedAt: nextStatus === 'approved' ? now : null,
          updatedAt: now,
        },
        { merge: true }
      );

      if (nextStatus === 'approved') {
        await Promise.all([
          setDoc(
            doc(db, `orgs/${orgId}/data_access_grants`, `${targetMemberId}-mida-core`),
            {
              memberId: targetMemberId,
              programId: 'mida-core',
              buyerId: null,
              dataTypes: ['profile', 'verification', 'participation'],
              status: 'active',
              grantedAt: now,
              expiresAt: null,
              linkedPermissionIds: [`${targetMemberId}-coop-baseline`],
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          ),
          setDoc(
            doc(db, `orgs/${orgId}/data_requests`, `${targetMemberId}-verification-evidence`),
            {
              memberId: targetMemberId,
              type: 'verification',
              status: 'completed',
              title: 'Complete verification evidence package',
              description: 'Submit the required operation profile and participation proof so internal review can begin.',
              dueAt: null,
              requestedBy: 'Merge OS',
              targetProgram: 'Data Coop',
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          ),
          ...REQUIRED_ASSETS.map((asset) =>
            setDoc(
              doc(db, `orgs/${orgId}/data_assets`, `${targetMemberId}-${asset.id}`),
              {
                reviewedAt: now,
                status: 'accepted',
                updatedAt: now,
              },
              { merge: true }
            )
          ),
        ]);
      }

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description:
          nextStatus === 'approved'
            ? 'Data Coop verification was approved.'
            : 'Data Coop verification was sent back for changes.',
        orgId,
        recordId: `${targetMemberId}-eligibility`,
        recordType: 'coop-verification-review',
      });
      setStatusMessage(
        nextStatus === 'approved'
          ? 'Verification approved. The member is now active in the cooperative.'
          : 'Verification sent back for changes.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update review state.');
    } finally {
      setBusy(null);
    }
  };

  const reviewAsset = async (
    targetMemberId: string,
    assetId: string,
    nextStatus: Extract<DataAssetStatus, 'accepted' | 'required'>
  ) => {
    if (!user || !orgId || !canAdmin) return;

    const now = new Date().toISOString();
    setBusy(`asset-${targetMemberId}-${assetId}-${nextStatus}`);
    try {
      await setDoc(
        doc(db, `orgs/${orgId}/data_assets`, assetId),
        {
          status: nextStatus,
          reviewedAt: nextStatus === 'accepted' ? now : null,
          notes:
            nextStatus === 'accepted'
              ? 'Evidence accepted by reviewer.'
              : 'Reviewer requested a fresh upload for this evidence item.',
          updatedAt: now,
        },
        { merge: true }
      );

      if (nextStatus === 'required') {
        await Promise.all([
          setDoc(
            doc(db, `orgs/${orgId}/coop_members`, targetMemberId),
            {
              status: 'needs_changes',
              updatedAt: now,
            },
            { merge: true }
          ),
          setDoc(
            doc(db, `orgs/${orgId}/coop_verifications`, `${targetMemberId}-eligibility`),
            {
              memberId: targetMemberId,
              status: 'needs_changes',
              reviewerUserId: user.uid,
              reviewedAt: now,
              notes: 'A reviewer requested a replacement evidence upload before approval.',
              updatedAt: now,
            },
            { merge: true }
          ),
          setDoc(
            doc(db, `orgs/${orgId}/data_requests`, `${targetMemberId}-verification-evidence`),
            {
              memberId: targetMemberId,
              type: 'verification',
              status: 'open',
              title: 'Complete verification evidence package',
              description: 'A reviewer requested a replacement evidence upload before approval.',
              dueAt: null,
              requestedBy: user.email || 'Merge reviewer',
              targetProgram: 'Data Coop',
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          ),
        ]);
      }

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description:
          nextStatus === 'accepted'
            ? 'Data Coop evidence was accepted by a reviewer.'
            : 'Data Coop evidence was sent back for re-upload.',
        orgId,
        recordId: assetId,
        recordType: 'data-asset-review',
      });

      setStatusMessage(
        nextStatus === 'accepted'
          ? 'Evidence accepted.'
          : 'Evidence sent back for re-upload.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update evidence review.');
    } finally {
      setBusy(null);
    }
  };

  const memberStatus = member?.status ?? 'invited';
  const verificationStatus = verification?.status ?? 'not_started';

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_#08111f,_#0f172a)] px-4 py-10 text-white">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/6 p-10 text-center shadow-[0_30px_120px_-40px_rgba(15,23,42,0.7)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-400/15 text-sky-200">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight">Enter Data Coop</h1>
          <p className="mt-4 text-sm leading-7 text-slate-200/85">
            Join the cooperative, sign your data agreements, complete verification, and manage participation inside the Merge ecosystem.
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_#08111f,_#0f172a)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6 shadow-[0_30px_120px_-40px_rgba(15,23,42,0.6)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-200/70">Data Coop</div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Member Participation Home</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200/80">
            This local Data Coop slice now covers agreements, permissions, real evidence uploads, and internal review readiness using canonical platform records.
          </p>
          {launchMessage ? <div className="mt-4 rounded-2xl border border-emerald-200/50 bg-emerald-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900">{launchMessage}</div> : null}
          {statusMessage ? <div className="mt-4 rounded-2xl border border-sky-200/50 bg-sky-50 px-4 py-3 text-sm text-sky-950">{statusMessage}</div> : null}
          {errorMessage ? <div className="mt-4 rounded-2xl border border-rose-200/50 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</div> : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
              <h2 className="text-xl font-semibold">Cooperative Status</h2>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Member</div><div className="mt-2 text-lg font-semibold">{member?.displayName || user.email}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Status</div><div className="mt-2 text-lg font-semibold">{memberStatusLabels[memberStatus]}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Verification</div><div className="mt-2 text-lg font-semibold">{verificationLabels[verificationStatus]}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Plan</div><div className="mt-2 text-lg font-semibold">{member?.plan || 'annual-membership'}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Agreements</div><div className="mt-2 text-lg font-semibold">{signedAgreementCount} / {requiredAgreementCount} signed</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Evidence</div><div className="mt-2 text-lg font-semibold">{submittedAssetCount} / {requiredAssetCount} uploaded</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Requests</div><div className="mt-2 text-lg font-semibold">{openRequestCount} open</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Permission</div><div className="mt-2 text-lg font-semibold">{activePermission ? 'Granted' : 'Needed'}</div></div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Next Actions</h2>
            </div>
            <div className="mt-6 space-y-3">
              {!member ? (
                <button type="button" disabled={busyAction !== null} onClick={() => void initializeMembership()} className="w-full rounded-2xl bg-sky-300 px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:opacity-60">
                  {busyAction === 'initialize' ? 'Starting membership...' : 'Initialize Data Coop Membership'}
                </button>
              ) : signedAgreementCount < requiredAgreementCount ? (
                <button type="button" disabled={busyAction !== null} onClick={() => void signAgreements()} className="w-full rounded-2xl bg-sky-300 px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:opacity-60">
                  {busyAction === 'agreements' ? 'Signing agreements...' : 'Sign Required Agreements'}
                </button>
              ) : !activePermission ? (
                <button type="button" disabled={busyAction !== null} onClick={() => void grantBaselinePermission()} className="w-full rounded-2xl bg-sky-300 px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:opacity-60">
                  {busyAction === 'grant-permission' ? 'Granting permission...' : 'Grant Baseline Data Permission'}
                </button>
              ) : !verificationReady ? (
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm leading-6 text-slate-200">Upload the required evidence files below, then send the verification package for review.</div>
              ) : verificationStatus === 'submitted' ? (
                <div className="rounded-2xl border border-amber-200/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Verification is in review. Internal reviewers can now approve or request changes.</div>
              ) : verificationStatus === 'approved' || memberStatus === 'active' ? (
                <div className="rounded-2xl border border-emerald-200/40 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">Cooperative access is active. MiData-ready permissions and access grants are now in place for downstream tools.</div>
              ) : (
                <button type="button" disabled={busyAction !== null} onClick={() => void submitVerification()} className="w-full rounded-2xl bg-sky-300 px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:opacity-60">
                  {busyAction === 'verification-submit' ? 'Submitting review package...' : 'Submit Verification Package'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Agreement Trail</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {DEFAULT_AGREEMENTS.map((agreement) => {
                const record = agreements.find((entry) => entry.agreementType === agreement.agreementType);
                return (
                  <div key={agreement.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                    <div className="text-lg font-semibold">{agreement.title}</div>
                    <div className="mt-2 text-sm text-slate-300">Version {agreement.agreementVersion}</div>
                    <div className="mt-4 text-sm text-slate-200">Status: <span className="font-semibold">{record?.status || 'required'}</span></div>
                    <div className="mt-1 text-xs text-slate-400">{record?.signedAt ? `Signed ${new Date(record.signedAt).toLocaleString()}` : 'Signature not yet recorded'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <UploadCloud className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Evidence Uploads</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {REQUIRED_ASSETS.map((asset) => {
                const record = assets.find((entry) => entry.assetType === asset.assetType);
                const submitted = record?.status === 'submitted' || record?.status === 'accepted';
                const selectedFile = selectedFiles[asset.id];
                return (
                  <div key={asset.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                    <div className="text-lg font-semibold">{asset.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{record?.status ?? 'required'}</div>
                    <div className="mt-2 text-sm text-slate-300">
                      {record?.fileName
                        ? `${record.fileName}${record.sizeBytes ? ` • ${(record.sizeBytes / 1024).toFixed(1)} KB` : ''}`
                        : 'No file uploaded yet'}
                    </div>
                    {record?.downloadUrl ? (
                      <a href={record.downloadUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-sky-200 underline-offset-4 hover:underline">
                        Open uploaded file
                      </a>
                    ) : null}
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="file"
                        className="text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-slate-100"
                        onChange={(event) => handleFileSelection(asset.id, event.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        disabled={!selectedFile || busyAction !== null || !member || signedAgreementCount < requiredAgreementCount}
                        onClick={() => void uploadEvidenceAsset(asset)}
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        {submitted ? (busyAction === `upload-${asset.id}` ? 'Uploading...' : 'Replace Upload') : busyAction === `upload-${asset.id}` ? 'Uploading...' : 'Upload File'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <ArrowRight className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Member Requests</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {requests.length ? requests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                  <div className="text-lg font-semibold">{request.title}</div>
                  <div className="mt-2 text-sm text-slate-300">{request.description}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-400">{request.status} • {request.targetProgram || 'Data Coop'}</div>
                </div>
              )) : <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-slate-300">No member requests yet.</div>}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Verification Review</h2>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Current case</div>
                <div className="mt-2 text-lg font-semibold">{verificationLabels[verificationStatus]}</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{verification?.notes || 'No verification notes yet.'}</div>
                <div className="mt-4 text-xs text-slate-400">{verification?.submittedAt ? `Submitted ${new Date(verification.submittedAt).toLocaleString()}` : 'No submission recorded yet'}</div>
                <div className="mt-1 text-xs text-slate-400">{verification?.reviewedAt ? `Reviewed ${new Date(verification.reviewedAt).toLocaleString()}` : 'Awaiting review'}</div>
              </div>
              {canAdmin ? (
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Reviewer Queue</div>
                  <div className="mt-4 grid gap-3">
                    {reviewQueue.length ? reviewQueue.map(({ verification: queueVerification, member: queueMember, assets: queueAssets }) => (
                      <div key={queueVerification.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                        <div className="text-base font-semibold">{queueMember?.displayName || queueMember?.email || queueVerification.memberId}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{verificationLabels[queueVerification.status]}</div>
                        <div className="mt-2 text-sm text-slate-300">{queueVerification.notes || 'Awaiting reviewer decision.'}</div>
                        <div className="mt-3 space-y-2">
                          {queueAssets.length ? queueAssets.map((asset) => (
                            <div key={asset.id} className="rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm">
                              <div className="font-semibold text-white">{asset.title}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">
                                {asset.status}{asset.fileName ? ` • ${asset.fileName}` : ''}
                              </div>
                              {asset.downloadUrl ? (
                                <a
                                  href={asset.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-block text-sm font-semibold text-sky-200 underline-offset-4 hover:underline"
                                >
                                  Open evidence
                                </a>
                              ) : null}
                            </div>
                          )) : (
                            <div className="text-sm text-slate-400">No evidence files linked yet.</div>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => void reviewVerification(queueVerification.memberId, 'approved')}
                            className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
                          >
                            {busyAction === `review-${queueVerification.memberId}-approved` ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => void reviewVerification(queueVerification.memberId, 'needs_changes')}
                            className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 disabled:opacity-60"
                          >
                            {busyAction === `review-${queueVerification.memberId}-needs_changes` ? 'Updating...' : 'Request Changes'}
                          </button>
                        </div>
                      </div>
                    )) : <div className="text-sm text-slate-300">No submitted verification cases right now.</div>}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Data Permissions</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {permissions.length ? permissions.map((permission) => (
                <div key={permission.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                  <div className="text-lg font-semibold">{permission.scope}</div>
                  <div className="mt-2 text-sm text-slate-300">{permission.purpose}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-400">{permission.status}{permission.grantedAt ? ` • granted ${new Date(permission.grantedAt).toLocaleString()}` : ''}</div>
                  {permission.status === 'granted' ? (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void revokeBaselinePermission()}
                      className="mt-4 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 disabled:opacity-60"
                    >
                      {busyAction === 'revoke-permission' ? 'Revoking...' : 'Revoke Permission'}
                    </button>
                  ) : null}
                </div>
              )) : <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-slate-300">No data permissions granted yet.</div>}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-sky-200" />
              <h2 className="text-xl font-semibold">Access Grants</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {accessGrants.length ? accessGrants.map((grant) => (
                <div key={grant.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                  <div className="text-lg font-semibold">{grant.programId}</div>
                  <div className="mt-2 text-sm text-slate-300">{grant.dataTypes.join(', ')}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-400">{grant.status}{grant.grantedAt ? ` • active ${new Date(grant.grantedAt).toLocaleString()}` : ''}</div>
                </div>
              )) : <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-slate-300">No downstream access grants yet. These will appear after internal approval.</div>}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/7 p-6">
          <div className="flex items-center gap-3">
            <ArrowRight className="h-5 w-5 text-sky-200" />
            <h2 className="text-xl font-semibold">MiData Handoff</h2>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/8 p-5">
            <div className="text-lg font-semibold">
              {accessGrants.find((grant) => grant.programId === 'mida-core' && grant.status === 'active')
                ? 'MiData access is ready'
                : 'MiData access is waiting on approval'}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-300">
              {accessGrants.find((grant) => grant.programId === 'mida-core' && grant.status === 'active')
                ? 'This member now has a downstream access grant that EcoStack and future MiData workflows can trust.'
                : 'Once verification is approved, the platform will create the canonical access grant for MiData and downstream program use.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
