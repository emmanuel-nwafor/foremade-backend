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
  next(); // Temporarily bypass role check to test
});

// Seller routes - redirect to login if not authenticated
router.use('/seller/*', (req, res, next) => {
  next(); // Temporarily bypass role check to test
});

module.exports = router;