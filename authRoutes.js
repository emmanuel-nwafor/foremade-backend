router.post('/authenticate', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const adminsRef = collection(db, 'admins');
    const adminQ = query(adminsRef, where('email', '==', email));
    const adminSnapshot = await getDocs(adminQ);
    const isAdminRegistered = !adminSnapshot.empty;

    const adminEmails = ['Foremade@icloud.com', 'echinecherem729@gmail.com'];
    const role = adminEmails.includes(email) ? 'admin' : 'buyer';
    const redirectUrl = role === 'admin' ? '/admin/dashboard' : '/profile';

    if (role === 'admin' && !isAdminRegistered) {
      // Allow admin role if email is in adminEmails, even if not in Firestore
      console.warn(`Admin ${email} not found in Firestore but allowed due to adminEmails list.`);
      return res.status(200).json({ isAdmin: true, role, redirectUrl });
    } else if (role === 'admin' && isAdminRegistered) {
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