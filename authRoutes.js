const express = require('express');
const { doc, getDoc } = require('firebase/firestore');
const { db } = require('./firebaseConfig');
const router = express.Router();

const ADMIN_EMAILS = [
  'echinecherem729@gmail.com',
  'emitexc.e.o1@gmail.com',
  'info@foremade.com',
  'support@foremade.com',
];

// Global authentication check
router.use((req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.redirect('/login');
  }
  next();
});

// Admin routes - redirect to login if not authenticated
router.use('/admin/*', (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.redirect('/login');
  }
  next();
});

// Seller routes - redirect to login if not authenticated
router.use('/seller/*', (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.redirect('/login');
  }
  next();
});

// Optional: Add role-based checks (currently redirects all unauthorized to login)
router.use('/admin/*', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (userId) {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists() || !ADMIN_EMAILS.includes(userSnap.data().email)) {
        return res.redirect('/login'); // Redirect non-admins to login
      }
    }
    next();
  } catch (error) {
    res.redirect('/login');
  }
});

router.use('/seller/*', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (userId) {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists() || !['Seller', 'Admin'].includes(userSnap.data().role)) {
        return res.redirect('/login'); // Redirect non-sellers to login
      }
    }
    next();
  } catch (error) {
    res.redirect('/login');
  }
});

module.exports = router;