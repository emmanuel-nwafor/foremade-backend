const express = require('express');
const { db, auth } = require('./firebaseConfig');
const { doc, getDoc, collection, getDocs, query, where, signInWithEmailAndPassword } = require('firebase/firestore');
const router = express.Router();

// Login endpoint
router.post('/authenticate', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const userSnapshot = await getDocs(q);
    if (userSnapshot.empty) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (user.uid !== userData.uid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const adminsRef = collection(db, 'admins');
    const adminQ = query(adminsRef, where('email', '==', email));
    const adminSnapshot = await getDocs(adminQ);
    const isAdmin = !adminSnapshot.empty;

    const redirectUrl = isAdmin ? '/admin/dashboard' : '/profile';
    res.status(200).json({ message: 'Authentication successful', uid: user.uid, redirectUrl });
  } catch (error) {
    console.error('Authentication error:', error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.status(500).json({ error: 'Authentication failed: ' + error.message });
  }
});

module.exports = router;