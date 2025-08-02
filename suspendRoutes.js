const express = require('express'); 
const { doc, updateDoc } = require('firebase/firestore');
const db = require('./firebaseConfig').db;
const router = express.Router();

// Suspend or unsuspend user
router.post('/admin/suspend-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body; // 'suspend' or 'unsuspend'
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

module.exports = router;