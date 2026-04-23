import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';

const PLATFORM_SOURCE_APP = 'foodcrm-pro';

export type PlatformEventAction = 'created' | 'updated' | 'deleted' | 'seeded';

export interface PlatformEventInput {
  action: PlatformEventAction;
  actorEmail?: string | null;
  actorUserId?: string | null;
  description: string;
  orgId: string;
  recordId: string;
  recordType: string;
}

export const getLegacyCollectionPath = (orgId: string, collectionName: string) => `users/${orgId}/${collectionName}`;

export const getOrgCollectionPath = (orgId: string, collectionName: string) => `orgs/${orgId}/${collectionName}`;

export const getOrgEventsPath = (orgId: string) => `orgs/${orgId}/events`;

export const withOrgPlatformMetadata = (payload: Record<string, unknown>, orgId: string) =>
  Object.fromEntries(
    Object.entries({
      ...payload,
      orgId,
      sourceApp: PLATFORM_SOURCE_APP,
    }).filter(([, value]) => value !== undefined)
  );

export const subscribeToCanonicalCollection = <T>({
  db,
  orgId,
  collectionName,
  mapDoc,
  onData,
  onError,
}: {
  db: Firestore;
  orgId: string;
  collectionName: string;
  mapDoc: (entry: QueryDocumentSnapshot<DocumentData>) => T;
  onData: (items: T[]) => void;
  onError: (error: unknown, path: string) => void;
}): Unsubscribe =>
  onSnapshot(
    collection(db, getOrgCollectionPath(orgId, collectionName)),
    async (snapshot) => {
      if (snapshot.empty) {
        try {
          const legacySnapshot = await getDocs(collection(db, getLegacyCollectionPath(orgId, collectionName)));
          if (!legacySnapshot.empty) {
            const batch = writeBatch(db);
            legacySnapshot.docs.forEach((entry) => {
              batch.set(
                doc(db, getOrgCollectionPath(orgId, collectionName), entry.id),
                withOrgPlatformMetadata(
                  {
                    id: entry.id,
                    ...entry.data(),
                  },
                  orgId
                ),
                { merge: true }
              );
            });
            await batch.commit();
            return;
          }
        } catch (legacyError) {
          onError(legacyError, getLegacyCollectionPath(orgId, collectionName));
        }

        onData([]);
        return;
      }

      onData(snapshot.docs.map(mapDoc));
    },
    (error) => {
      onError(error, getOrgCollectionPath(orgId, collectionName));
    }
  );

export const writeCanonicalRecord = async (
  db: Firestore,
  orgId: string,
  collectionName: string,
  docId: string,
  payload: Record<string, unknown>
) => {
  await Promise.all([
    setDoc(doc(db, getLegacyCollectionPath(orgId, collectionName), docId), payload),
    setDoc(doc(db, getOrgCollectionPath(orgId, collectionName), docId), withOrgPlatformMetadata(payload, orgId)),
  ]);
};

export const deleteCanonicalRecord = async (
  db: Firestore,
  orgId: string,
  collectionName: string,
  docId: string
) => {
  await Promise.all([
    deleteDoc(doc(db, getLegacyCollectionPath(orgId, collectionName), docId)),
    deleteDoc(doc(db, getOrgCollectionPath(orgId, collectionName), docId)),
  ]);
};

export const seedCanonicalRecord = (
  batch: WriteBatch,
  db: Firestore,
  orgId: string,
  collectionName: string,
  docId: string,
  payload: Record<string, unknown>
) => {
  batch.set(doc(db, getLegacyCollectionPath(orgId, collectionName), docId), payload);
  batch.set(doc(db, getOrgCollectionPath(orgId, collectionName), docId), withOrgPlatformMetadata(payload, orgId));
};

export const writePlatformEvent = async (
  db: Firestore,
  { action, actorEmail, actorUserId, description, orgId, recordId, recordType }: PlatformEventInput
) => {
  const eventRef = doc(collection(db, getOrgEventsPath(orgId)));
  await setDoc(eventRef, {
    id: eventRef.id,
    action,
    actorEmail: actorEmail || null,
    actorUserId: actorUserId || null,
    createdAt: new Date().toISOString(),
    description,
    orgId,
    recordId,
    recordType,
    sourceApp: PLATFORM_SOURCE_APP,
  });
};
