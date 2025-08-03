const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const admin = require('firebase-admin');

// Client SDK config (for direct Firestore access)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// Admin SDK config (for server-side authentication)
let adminApp;
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set in the environment');
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  }, 'adminApp'); // Optional: Add a unique app name to avoid conflicts
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Firebase Admin SDK initialization error:', error.message);
  throw new Error('Failed to initialize Admin SDK. Ensure FIREBASE_SERVICE_ACCOUNT_KEY is set with a valid service account JSON.');
}

const adminAuth = admin.auth(adminApp);
const adminDb = admin.firestore(adminApp);

module.exports = { db, adminAuth, adminDb, admin };