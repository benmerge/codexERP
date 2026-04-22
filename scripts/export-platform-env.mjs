import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '..', 'platform', 'deployment-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const target = process.argv[2];

if (!target || !['foodcrm-pro', 'miremix-mrp'].includes(target)) {
  console.error('Usage: node scripts/export-platform-env.mjs <foodcrm-pro|miremix-mrp>');
  process.exit(1);
}

const baseEnv = {
  FIREBASE_PROJECT_ID: config.projectId,
  CLOUD_RUN_REGION: config.cloudRunRegion,
  VITE_FIREBASE_API_KEY: config.firebaseWebConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: config.firebaseWebConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: config.firebaseWebConfig.projectId,
  VITE_FIREBASE_APP_ID: config.firebaseWebConfig.appId,
  VITE_FIREBASE_STORAGE_BUCKET: config.firebaseWebConfig.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: config.firebaseWebConfig.messagingSenderId,
  VITE_FIREBASE_MEASUREMENT_ID: config.firebaseWebConfig.measurementId,
  VITE_SHARED_ORG_ID: config.sharedOrgId
};

const targetEnv =
  target === 'foodcrm-pro'
    ? {
        CLOUD_RUN_SERVICE: config.crm.serviceName,
        VITE_FIREBASE_DATABASE_ID: config.crm.firestoreDatabaseId,
        VITE_CRM_FIRESTORE_DATABASE_ID: config.crm.firestoreDatabaseId,
        VITE_CRM_APP_URL: config.crm.appUrl,
        VITE_CRM_SHARED_ORG_ID: config.sharedOrgId,
        VITE_CRM_ORDERS_COLLECTION: config.ordersCollection,
        VITE_MIREMIX_FIRESTORE_DATABASE_ID: config.remix.firestoreDatabaseId,
        VITE_MIREMIX_APP_URL: config.remix.appUrl
      }
    : {
        VITE_FIREBASE_DATABASE_ID: config.remix.firestoreDatabaseId,
        VITE_CRM_FIRESTORE_DATABASE_ID: config.crm.firestoreDatabaseId,
        VITE_CRM_APP_URL: config.crm.appUrl,
        VITE_CRM_SHARED_ORG_ID: config.sharedOrgId,
        VITE_CRM_ORDERS_COLLECTION: config.ordersCollection,
        VITE_MIREMIX_FIRESTORE_DATABASE_ID: config.remix.firestoreDatabaseId
      };

const env = { ...baseEnv, ...targetEnv };

for (const [key, value] of Object.entries(env)) {
  console.log(`${key}=${value}`);
}
