import { collection, doc, getDoc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';

export type ToolLaunchSession = {
  id: string;
  createdAt: string;
  launchedAt?: string | null;
  launcherToolId: string;
  orgId: string;
  returnUrl: string;
  status: 'created' | 'consumed';
  targetUrl: string;
  toolId: string;
  userEmail?: string | null;
  userId: string;
};

export const getOrgLaunchSessionsPath = (orgId: string) => `orgs/${orgId}/launch_sessions`;

export const buildLaunchUrl = (targetUrl: string, launchId: string) => {
  const url = new URL(targetUrl, window.location.origin);
  url.searchParams.set('launchId', launchId);
  return url.toString();
};

export const createToolLaunchSession = async ({
  db,
  orgId,
  returnUrl,
  targetUrl,
  toolId,
  userEmail,
  userId,
}: {
  db: Firestore;
  orgId: string;
  returnUrl: string;
  targetUrl: string;
  toolId: string;
  userEmail?: string | null;
  userId: string;
}) => {
  const launchRef = doc(collection(db, getOrgLaunchSessionsPath(orgId)));
  const payload: ToolLaunchSession = {
    id: launchRef.id,
    createdAt: new Date().toISOString(),
    launchedAt: null,
    launcherToolId: 'platform-home',
    orgId,
    returnUrl,
    status: 'created',
    targetUrl,
    toolId,
    userEmail: userEmail || null,
    userId,
  };

  await setDoc(launchRef, payload);
  return payload;
};

export const resolveToolLaunchSession = async ({
  db,
  launchId,
  orgId,
}: {
  db: Firestore;
  launchId: string;
  orgId: string;
}) => {
  const launchRef = doc(db, getOrgLaunchSessionsPath(orgId), launchId);
  const snapshot = await getDoc(launchRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as ToolLaunchSession;
};

export const consumeToolLaunchSession = async ({
  db,
  launchId,
  orgId,
}: {
  db: Firestore;
  launchId: string;
  orgId: string;
}) => {
  await updateDoc(doc(db, getOrgLaunchSessionsPath(orgId), launchId), {
    launchedAt: new Date().toISOString(),
    status: 'consumed',
  });
};
