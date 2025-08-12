// routes/admin.js
const express = require('express');
const { db } = require('./firebaseConfig');
const { collection, getDocs, query, where, doc, getDoc } = require('firebase/firestore');
const { verifyAndCheckAdmin } = require('./verifyAndCheckAdmin');

const router = express.Router();

/**
 * POST /authenticate
 * - Expects Authorization: Bearer <idToken>
 * - Verifies token, responds with role and redirectUrl
 */
router.post('/authenticate', async (req, res) => {
  try {
    // We accept token in Authorization header
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    // We'll reuse the verify logic from middleware
    // Note: We don't call middleware here because we want to respond with role info
    const idToken = authHeader.split('Bearer ')[1];
    // verify token using the helper inside verifyAndCheckAdmin module
    const { verifyIdToken } = require('./verifyAndCheckAdmin'); // not exported currently
    // But simpler: call verifyAndCheckAdmin by building a small wrapper.

    // Instead of re-importing internal helper, just call the middleware-like logic:
    // Reuse the same code path by creating a temporary fake req/res/next or extract to helper.
    // For clarity here, verify via the middleware function by calling it and catching req.user
    // We'll implement a small inline verification to avoid circular imports:

    // Inline verification (light): call firebase REST API directly
    const fetch = global.fetch || require('node-fetch');
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`;

    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    const verifyData = await verifyRes.json();
    if (!verifyData.users || !verifyData.users.length) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const firebaseUser = verifyData.users[0];
    const uid = firebaseUser.localId;
    const email = firebaseUser.email;

    // check in admins collection
    const adminsRef = collection(db, 'admins');
    const byEmailQ = query(adminsRef, where('email', '==', email));
    const adminSnapshot = await getDocs(byEmailQ);
    const isAdminRegistered = !adminSnapshot.empty;

    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const isAdminEmail = adminEmails.includes((email || '').toLowerCase());
    const role = isAdminEmail || isAdminRegistered ? 'admin' : 'buyer';
    const redirectUrl = role === 'admin' ? '/admin/dashboard' : '/profile';

    return res.status(200).json({ isAdmin: role === 'admin', role, redirectUrl });
  } catch (err) {
    console.error('POST /authenticate error:', err);
    return res.status(500).json({ error: 'Server error during authentication' });
  }
});

/**
 * GET /admin/dashboard
 * Protected route — uses verifyAndCheckAdmin middleware
 */
router.get('/admin/dashboard', verifyAndCheckAdmin, async (req, res) => {
  try {
    // req.user set by middleware
    const { uid, email } = req.user;

    // Optionally fetch additional admin profile data from Firestore
    const adminDocRef = doc(db, 'admins', uid);
    const adminDoc = await getDoc(adminDocRef);
    const adminProfile = adminDoc.exists() ? adminDoc.data() : null;

    res.status(200).json({
      message: 'Welcome to the admin dashboard',
      user: { uid, email },
      profile: adminProfile,
    });
  } catch (err) {
    console.error('GET /admin/dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
