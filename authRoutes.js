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

    // Define admin emails
    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const role = adminEmails.includes(email) ? 'admin' : 'buyer';
    const redirectUrl = role === 'admin' ? '/admin/dashboard' : '/profile';

    // Ensure the user exists in the admins collection if they are an admin
    if (role === 'admin' && isAdmin) {
      res.status(200).json({ isAdmin: true, role, redirectUrl });
    } else if (role === 'buyer') {
      res.status(200).json({ isAdmin: false, role, redirectUrl });
    } else {
      return res.status(403).json({ error: 'Unauthorized access. Admin not registered in the system.' });
    }
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

module.exports = router;