const express = require('express');
const { db } = require('./firebaseConfig');
const { doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc, deleteDoc, createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } = require('firebase/firestore');
const { auth } = require('./firebaseConfig');
const router = express.Router();

// Admin middleware (queries DB directly)
router.use('/admin/*all', async (req, res, next) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || userSnap.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin access denied' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Add new admin
router.post('/admin/add-admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const userSnapshot = await getDocs(q);
    if (!userSnapshot.empty) {
      return res.status(409).json({ error: 'Email already in use' });
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

// Suspend or unsuspend user
router.post('/admin/suspend-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body;
    if (!['suspend', 'unsuspend'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "suspend" or "unsuspend"' });
    }

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      status: action === 'suspend' ? 'suspended' : 'active',
      updatedAt: new Date().toISOString(),
    });
    res.json({ message: `User ${action === 'suspend' ? 'suspended' : 'unsuspended'} successfully` });
  } catch (error) {
    console.error('Error suspending/unsuspending user:', error);
    res.status(500).json({ error: 'Failed to update user status: ' + error.message });
  }
});

// Delete user
router.delete('/admin/delete-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    res.json({ message: `User ${userId} deleted successfully` });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user: ' + error.message });
  }
});

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