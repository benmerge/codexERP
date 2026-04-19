import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { crmConfig } from './config';
import { firebaseDatabaseId, firebaseWebConfig } from './firebaseConfig';

const app = initializeApp(firebaseWebConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseDatabaseId);
export const defaultDb = getFirestore(app); // The (default) database instance
export const crmDb = crmConfig.firestoreDatabaseId
  ? getFirestore(app, crmConfig.firestoreDatabaseId)
  : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const login = () => signInWithPopup(auth, googleProvider);
export const logout = () => auth.signOut();

// Connection test as required by instructions
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. It appears to be offline or configured incorrectly.");
    }
  }
}
testConnection();

export { onAuthStateChanged, type User };
