import { doc, getDoc, updateDoc, type Firestore } from 'firebase/firestore';

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

const getOrgLaunchSessionsPath = (orgId: string) => `orgs/${orgId}/launch_sessions`;

export const resolveToolLaunchSession = async ({
  db,
  launchId,
  orgId,
}: {
  db: Firestore;
  launchId: string;
  orgId: string;
}) => {
  const snapshot = await getDoc(doc(db, getOrgLaunchSessionsPath(orgId), launchId));
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
