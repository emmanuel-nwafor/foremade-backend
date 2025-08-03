const express = require('express');
const { doc, deleteDoc } = require('firebase/firestore');
const db = require('./firebaseConfig').db;
const router = express.Router();

// Delete user
router.delete('/admin/delete-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userRef = doc(db, 'users', userId);
    await admin.auth().deleteUser(userId);
    await deleteDoc(userRef);
    res.json({ message: `User ${userId} deleted successfully` });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user: ' + error.message });
  }
});


module.exports = router;