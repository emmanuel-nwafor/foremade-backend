const express = require('express');
const { db } = require('./firebaseConfig');
const { collection, getDocs, query, where } = require('firebase/firestore');
const router = express.Router();

// Middleware to check authorization based on token
const requireAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No valid token provided' });
  }
  req.token = authHeader.split(' ')[1];
  next();
};

// Authentication endpoint
router.post('/authenticate', async (req, res) => {
  try {
    console.log('Received body:', req.body);
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
      // Optionally register admin in Firestore here if needed
    }

    res.status(200).json({ isAdmin: isAdminEmail, role, redirectUrl });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

// Updated /auth/check endpoint
router.post('/auth/check', requireAuth, async (req, res) => {
  try {
    console.log('Received headers:', req.headers);
    const userEmail = req.headers['x-user-email'];
    if (!userEmail) {
      return res.status(401).json({ error: 'Unauthorized: No user email provided' });
    }

    const adminsRef = collection(db, 'admins');
    const adminQ = query(adminsRef, where('email', '==', userEmail));
    const adminSnapshot = await getDocs(adminQ);
    const isAdminRegistered = !adminSnapshot.empty;

    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const isAdminEmail = adminEmails.includes(userEmail);
    const isAdmin = isAdminEmail && isAdminRegistered;
    const role = isAdmin ? 'admin' : 'buyer';

    console.log(`User ${userEmail} isAdmin: ${isAdmin}, role: ${role}`); // Debug log
    res.status(200).json({ isAdmin, role });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Auth check failed: ' + error.message });
  }
});

// Protected admin dashboard route
router.get('/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
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