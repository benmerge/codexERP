import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseDatabaseId, firebaseWebConfig } from './firebaseConfig';

const app = initializeApp(firebaseWebConfig);
export const db = getFirestore(app, firebaseDatabaseId);
export const auth = getAuth(app);
