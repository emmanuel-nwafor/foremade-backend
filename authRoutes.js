const express = require('express');
const { doc, getDoc, setDoc, addDoc, collection } = require('firebase/firestore');
const { db } = require('./firebaseConfig');
const router = express.Router();

const ADMIN_EMAILS = [
  'echinecherem729@gmail.com', 
  'emitexc.e.o1@gmail.com', 
  'info@foremade.com', 
  'support@foremade.com',
];

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     description: Register a user, assign Buyer role by default, and redirect to profile
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *               - username
 *               - uid
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               phoneNumber:
 *                 type: string
 *                 example: "+2341234567890"
 *               username:
 *                 type: string
 *                 example: "johndoe"
 *               uid:
 *                 type: string
 *                 description: Firebase Auth UID
 *                 example: "user123"
 *     responses:
 *       200:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered, redirecting to profile"
 *                 role:
 *                   type: string
 *                   example: "Buyer"
 *                 redirectUrl:
 *                   type: string
 *                   example: "/profile"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', async (req, res) => {
  const { email, firstName, lastName, phoneNumber, username, uid } = req.body;

  try {
    if (!email || !firstName || !lastName || !username || !uid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const role = ADMIN_EMAILS.includes(email) ? 'Admin' : 'Buyer';

    const userRef = doc(db, 'users', uid);
    const userData = {
      email,
      name: `${firstName} ${lastName}`,
      username,
      phoneNumber: phoneNumber || '',
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(userRef, userData, { merge: true });

    await addDoc(collection(db, 'notifications'), {
      type: 'user_signup',
      message: `New user signed up: ${email} as ${role}`,
      createdAt: new Date(),
      details: { user_id: uid, email, role },
    });

    res.status(200).json({ message: 'User registered, redirecting to profile', role, redirectUrl: role === 'Admin' ? '/admin-dashboard' : '/profile' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

router.use('/admin/*all', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || userSnap.data().role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed: ' + error.message });
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