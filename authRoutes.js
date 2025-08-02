const express = require('express');
const { auth } = require('./firebaseConfig');
const { doc, getDoc, setDoc, collection, getDocs } = require('firebase/firestore');
const { createUserWithEmailAndPassword, updateProfile } = require('firebase/auth');
const db = require('./firebaseConfig').db;
const router = express.Router();
const { authenticateFirebaseToken } = require('./middleware');

let ADMIN_EMAILS = [
  'echinecherem729@gmail.com',
  'info@foremade.com',
  'support@foremade.com',
];

// Update admin emails dynamically
const updateAdminEmails = async () => {
  try {
    const adminsSnapshot = await getDocs(collection(db, 'users'));
    ADMIN_EMAILS = adminsSnapshot.docs
      .filter((doc) => doc.data().role === 'admin')
      .map((doc) => doc.data().email);
  } catch (error) {
    console.error('Error updating admin emails:', error);
  }
};

// Ensure ADMIN_EMAILS is initialized before routes
(async () => {
  await updateAdminEmails();
})();

// Admin middleware
router.use('/admin/*all', authenticateFirebaseToken, async (req, res, next) => {
  try {
    const userId = req.user.uid;
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || !ADMIN_EMAILS.includes(userSnap.data().email)) {
      return res.status(403).json({ error: 'Admin access denied' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Seller middleware
router.use('/seller/*all', authenticateFirebaseToken, async (req, res, next) => {
  try {
    const userId = req.user.uid;
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || !['seller', 'pro seller', 'admin'].includes(userSnap.data().role.toLowerCase())) {
      return res.status(403).json({ error: 'Access denied: Seller, Pro Seller, or Admin role required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed: ' + error.message });
  }
});

// Add new admin
router.post('/admin/add-admin', authenticateFirebaseToken, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newAdmin = userCredential.user;

    const username = email.split('@')[0];
    await updateProfile(newAdmin, { displayName: username });

    await setDoc(doc(db, 'users', newAdmin.uid), {
      email,
      name: username,
      username,
      role: 'admin',
      status: 'active',
      preRegistered: true,
      createdAt: new Date().toISOString(),
      uid: newAdmin.uid,
      profileImage: null,
    });

    await updateAdminEmails();
    res.status(201).json({ message: 'Admin added successfully', uid: newAdmin.uid });
  } catch (error) {
    console.error('Error adding admin:', error);
    if (error.code === 'auth/email-already-in-use') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to add admin: ' + error.message });
  }
});

module.exports = router;