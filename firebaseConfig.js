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
  // Try to initialize with service account key
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  } else {
    // Fallback to default credentials (for development)
    adminApp = admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
} catch (error) {
  console.warn('Firebase Admin SDK initialization warning:', error.message);
  console.log('Using client SDK only. For production, set FIREBASE_SERVICE_ACCOUNT_KEY');
}

const adminAuth = adminApp ? admin.auth(adminApp) : null;
const adminDb = adminApp ? admin.firestore(adminApp) : null;

module.exports = { 
  db, 
  adminAuth, 
  adminDb,
  admin 
};