import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseDatabaseId, firebaseWebConfig } from './firebaseConfig';
import { crmAppConfig } from './config';

const app = initializeApp(firebaseWebConfig);
export const db = getFirestore(app, firebaseDatabaseId);
export const miremixDb = getFirestore(app, crmAppConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
