const express = require('express');
const cors = require('cors');
const { db } = require('./firebaseConfig');
const { collection, getDocs, query, where } = require('firebase/firestore');
const router = express.Router();

router.post('/authenticate', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const adminsRef = collection(db, 'admins');
    const adminQ = query(adminsRef, where('email', '==', email));
    const adminSnapshot = await getDocs(adminQ);
    const isAdmin = !adminSnapshot.empty;

    const redirectUrl = isAdmin ? '/admin/dashboard' : '/profile';
    res.status(200).json({ isAdmin, redirectUrl });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

module.exports = router;