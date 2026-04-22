import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  type QuerySnapshot,
  type DocumentData,
  type Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { crmConfig } from '../config';

const PLATFORM_SOURCE_APP = 'miremix-mrp';
const hydrationPromises = new Map<string, Promise<boolean>>();

export const getPlatformSourceApp = () => PLATFORM_SOURCE_APP;

export const getOrgCollectionRef = (collectionName: string) =>
  collection(db, 'orgs', crmConfig.sharedOrgId, collectionName);

export const getLegacyCollectionRef = (collectionName: string) =>
  collection(db, collectionName);

export const getOrgDocRef = (collectionName: string, docId: string) =>
  doc(db, 'orgs', crmConfig.sharedOrgId, collectionName, docId);

export const getLegacyDocRef = (collectionName: string, docId: string) =>
  doc(db, collectionName, docId);

export const withPlatformMetadata = <T extends Record<string, unknown>>(payload: T) => ({
  ...payload,
  orgId: crmConfig.sharedOrgId,
  sourceApp: PLATFORM_SOURCE_APP,
});

const hydrateCanonicalCollection = async (collectionName: string) => {
  const existing = hydrationPromises.get(collectionName);
  if (existing) return existing;

  const next = (async () => {
    const legacySnapshot = await getDocs(query(getLegacyCollectionRef(collectionName)));
    if (legacySnapshot.empty) {
      return false;
    }

    const batch = writeBatch(db);
    legacySnapshot.docs.forEach((entry) => {
      batch.set(
        getOrgDocRef(collectionName, entry.id),
        withPlatformMetadata({
          id: entry.id,
          ...entry.data(),
        }),
        { merge: true }
      );
    });
    await batch.commit();
    return true;
  })();

  hydrationPromises.set(collectionName, next);
  try {
    return await next;
  } finally {
    hydrationPromises.delete(collectionName);
  }
};

export const subscribeToPlatformCollection = <T>({
  collectionName,
  mapDoc,
  onData,
  onError,
}: {
  collectionName: string;
  mapDoc: (snapshot: QuerySnapshot<DocumentData>['docs'][number]) => T;
  onData: (items: T[]) => void;
  onError: (error: unknown) => void;
}): Unsubscribe =>
  onSnapshot(
    query(getOrgCollectionRef(collectionName)),
    (snapshot) => {
      if (snapshot.empty) {
        void hydrateCanonicalCollection(collectionName)
          .then((hydrated) => {
            if (!hydrated) onData([]);
          })
          .catch(onError);
        return;
      }

      onData(snapshot.docs.map(mapDoc));
    },
    onError
  );

export const writePlatformRecord = async (
  collectionName: string,
  docId: string,
  payload: Record<string, unknown>,
  options?: { merge?: boolean }
) => {
  const data = withPlatformMetadata({
    id: docId,
    ...payload,
  });

  await Promise.all([
    setDoc(getOrgDocRef(collectionName, docId), data, options),
    setDoc(getLegacyDocRef(collectionName, docId), data, options),
  ]);
};
