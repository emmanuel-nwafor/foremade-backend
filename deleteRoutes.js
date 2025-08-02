const express = require('express');
const { doc, deleteDoc, getDoc } = require('firebase/firestore');
const db = require('./firebaseConfig').db;
const { authenticateFirebaseToken } = require('./middleware');
const router = express.Router();

// Delete user
router.delete('/admin/delete-user/:userId', authenticateFirebaseToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify admin role
    const adminId = req.user.uid;
    const adminDoc = await getDoc(doc(db, 'users', adminId));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin access denied' });
    }

    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user: ' + error.message });
  }
});

module.exports = router;