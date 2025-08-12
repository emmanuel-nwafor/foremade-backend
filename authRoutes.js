const express = require('express');
const admin = require('firebase-admin'); // Ensure Firebase Admin SDK is initialized in firebaseConfig.js
const { db } = require('./firebaseConfig');
const { collection, getDocs, query, where } = require('firebase/firestore');
const router = express.Router();

// Middleware to check authorization based on email header
const requireAuth = (req, res, next) => {
  const userEmail = req.headers['x-user-email'];
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized: No user email provided' });
  }
  req.userEmail = userEmail;
  next();
};

// Initialize admin accounts with passwords (run once, then comment out)
const initializeAdminAccounts = async () => {
  const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
  const adminPasswords = {
    'Foremade@icloud.com': 'Admin$ecure2025!F',
    'echinecherem729@gmail.com': 'Adm1nP@ssw0rd!25',
  };

  for (const [email, password] of Object.entries(adminPasswords)) {
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      console.log(`User ${email} already exists`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        await admin.auth().createUser({
          email,
          password,
          displayName: email.split('@')[0],
        });
        console.log(`Created admin user ${email} with password ${password}`);
      }
    }

    // Add to admins collection in Firestore
    const adminDoc = doc(db, 'admins', email);
    await setDoc(adminDoc, { email, role: 'admin' }, { merge: true });
  }
};

// Uncomment to initialize admins (run once)
// initializeAdminAccounts().then(() => console.log('Admin accounts initialized'));

// Authentication endpoint: checks if email is admin and returns role info
router.post('/authenticate', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const adminsRef = collection(db, 'admins');
    const adminQ = query(adminsRef, where('email', '==', email));
    const adminSnapshot = await getDocs(adminQ);
    const isAdminRegistered = !adminSnapshot.empty;

    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const isAdminEmail = adminEmails.includes(email);
    const role = isAdminEmail ? 'admin' : 'buyer';
    const redirectUrl = role === 'admin' ? '/admin/dashboard' : '/profile';

    if (role === 'admin' && !isAdminRegistered) {
      console.warn(`Admin ${email} not found in Firestore but allowed due to adminEmails list.`);
      await setDoc(doc(db, 'admins', email), { email, role: 'admin' });
      return res.status(200).json({ isAdmin: true, role, redirectUrl });
    }

    if (role === 'admin' && isAdminRegistered) {
      return res.status(200).json({ isAdmin: true, role, redirectUrl });
    }

    if (role === 'buyer') {
      return res.status(200).json({ isAdmin: false, role, redirectUrl });
    }

    return res.status(403).json({ error: 'Unauthorized access. Admin not registered.' });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

// Protected admin dashboard route
router.get('/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const userEmail = req.userEmail;
    const adminsRef = collection(db, 'admins');
    const adminQ = query(adminsRef, where('email', '==', userEmail));
    const adminSnapshot = await getDocs(adminQ);
    const isAdminRegistered = !adminSnapshot.empty;

    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const isAdmin = adminEmails.includes(userEmail);

    if (!isAdmin || !isAdminRegistered) {
      return res.status(403).json({ error: 'Forbidden: Access to admin dashboard denied' });
    }

    res.status(200).json({ message: 'Welcome to the admin dashboard', userEmail });
  } catch (error) {
    console.error('Admin dashboard access error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

module.exports = router;