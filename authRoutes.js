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

router.use('/admin/*all', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.redirect('/login');
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || !ADMIN_EMAILS.includes(userSnap.data().email)) {
      return res.redirect('/login');
    }
    next();
  } catch (error) {
    res.redirect('/login');
  }
});

router.use('/seller/*all', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || !['Seller', 'Admin'].includes(userSnap.data().role)) {
      return res.status(403).json({ error: 'Access denied: Seller or Admin role required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed: ' + error.message });
  }
});

module.exports = router;