const express = require('express');
const { auth } = require('./firebaseConfig');
const { doc, getDoc, setDoc, collection, getDocs, query, where } = require('firebase/firestore');
const { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } = require('firebase/auth');
const db = require('./firebaseConfig').db;
const router = express.Router();
const { authenticateFirebaseToken } = require('./middleware');

// Admin middleware
router.use('/admin/*all', authenticateFirebaseToken, async (req, res, next) => {
  try {
    const userId = req.user.uid;
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
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
router.post('/admin/add-admin', async (req, res) => {
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

    // Save to admins collection
    await setDoc(doc(collection(db, 'admins'), newAdmin.uid), {
      email,
      uid: newAdmin.uid,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Admin added successfully', uid: newAdmin.uid });
  } catch (error) {
    console.error('Error adding admin:', error);
    if (error.code === 'auth/email-already-in-use') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to add admin: ' + error.message });
  }
});

// Login endpoint with role-based redirection
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const response = await fetch('https://foremade-backend.onrender.com/verify-otp-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const otpData = await response.json();
    if (!otpData.success) {
      return res.status(400).json({ error: otpData.error || 'Please verify your email with the code sent to you.' });
    }

    const userDoc = doc(db, 'users', user.uid);
    const userSnapshot = await getDoc(userDoc);
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'Account not found. Please contact support.' });
    }

    const userData = userSnapshot.data();
    localStorage.setItem('userData', JSON.stringify(userData));

    // Check if email exists in admins collection
    const adminsRef = collection(db, 'admins');
    const q = query(adminsRef, where('email', '==', email));
    const adminSnapshot = await getDocs(q);
    const isAdmin = !adminSnapshot.empty;

    const redirectUrl = isAdmin ? '/admin/dashboard' : '/profile';
    res.status(200).json({ message: 'Login successful', uid: user.uid, redirectUrl });
  } catch (error) {
    console.error('Error logging in:', error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

module.exports = router;