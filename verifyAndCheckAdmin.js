// middleware/verifyAndCheckAdmin.js
// CommonJS style to match your codebase
const { collection, query, where, getDocs, doc, getDoc } = require('firebase/firestore');
const { db } = require('./firebaseConfig');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

if (!FIREBASE_API_KEY) {
  console.warn('FIREBASE_API_KEY not set. Token verification will fail without it.');
}

// Helper: verify idToken with Firebase REST API (accounts:lookup)
async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('No ID token provided');

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
  // Use global fetch (Node 18+) or node-fetch if installed
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const data = await res.json();
  if (!data || !data.users || data.users.length === 0) {
    const err = new Error('Invalid ID token');
    err.info = data;
    throw err;
  }

  // Return the user record from Firebase REST API
  return data.users[0];
}

/**
 * Middleware to:
 * - verify Firebase ID token in Authorization header `Bearer <token>`
 * - check Firestore `admins` collection for the user's uid OR email
 * - if not admin -> respond 403
 *
 * Attaches req.user = { uid, email, firebaseUserRecord }
 */
async function verifyAndCheckAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No Bearer token provided' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: 'Unauthorized: Empty token' });

    // 1) verify token with Firebase REST API
    const firebaseUser = await verifyIdToken(idToken);
    const uid = firebaseUser.localId;
    const email = firebaseUser.email;

    // 2) check Firestore admins collection
    // Prefer checking by uid; fallback to email if uid not present in admins
    const adminsByUidRef = doc(db, 'admins', uid);
    const adminByUidSnap = await getDoc(adminsByUidRef);
    let isAdminRegistered = false;
    if (adminByUidSnap.exists()) {
      isAdminRegistered = true;
    } else {
      // fallback: query by email
      const adminsRef = collection(db, 'admins');
      const adminQ = query(adminsRef, where('email', '==', email));
      const adminSnapshot = await getDocs(adminQ);
      isAdminRegistered = !adminSnapshot.empty;
    }

    // 3) whitelist emails if you want (same as before). Remove if you want strict Firestore-only.
    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const isAdminEmail = adminEmails.includes((email || '').toLowerCase());

    if (!isAdminRegistered && !isAdminEmail) {
      return res.status(403).json({ error: 'Forbidden: You are not an admin' });
    }

    // Attach user info to request
    req.user = {
      uid,
      email,
      firebaseUser, // raw firebase user object from REST call
    };

    next();
  } catch (err) {
    console.error('verifyAndCheckAdmin error:', err?.message || err);
    // Provide less detail in production
    if (err?.message && err.message.includes('Invalid ID token')) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
    return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }
}

module.exports = { verifyAndCheckAdmin };
