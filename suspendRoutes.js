const express = require('express'); 
const { doc, updateDoc, getDoc } = require('firebase/firestore');
const db = require('./firebaseConfig').db;
const { authenticateFirebaseToken } = require('./middleware');
const router = express.Router();

// Suspend or unsuspend user
router.post('/admin/suspend-user/:userId', authenticateFirebaseToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body; // 'suspend' or 'unsuspend'
    if (!['suspend', 'unsuspend'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "suspend" or "unsuspend"' });
    }

    // Verify admin role
    const adminId = req.user.uid;
    const adminDoc = await getDoc(doc(db, 'users', adminId));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin access denied' });
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

module.exports = router;