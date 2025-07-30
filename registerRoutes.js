const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db, adminAuth, adminDb } = require('./firebaseConfig');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Registration',
    text: `Your OTP is ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Email send error:', err);
    throw err;
  }
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => {
  const hasLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[_@!+=#$%^&*()[\]{}|;:,.<>?~`/-]/.test(password);
  console.log('Password validation:', { password, hasLength, hasLetter, hasNumber, hasSpecialChar });
  return hasLength && hasLetter && hasNumber && hasSpecialChar;
};

// Register endpoint with detailed logging
router.post('/register', async (req, res) => {
  console.log('Raw request body:', JSON.stringify(req.body, null, 2)); // Log raw body
  if (!req.body || Object.keys(req.body).length === 0) {
    console.error('No body received in request');
    return res.status(400).json({ success: false, error: 'No data received' });
  }

  const { firstName, lastName, email, password, phoneNumber, username } = req.body;
  console.log('Destructured data:', { firstName, lastName, email, password, phoneNumber, username });

  try {
    if (!firstName?.trim()) throw new Error('First name is required.');
    if (!lastName?.trim()) throw new Error('Last name is required.');
    if (!validateEmail(email)) throw new Error('Invalid email format.');
    if (!password) throw new Error('Password is required.');
    if (!validatePassword(password)) throw new Error('Password must have 6+ chars, a letter, a number, and a special char.');

    const existingUser = await adminAuth.getUserByEmail(email).catch(err => {
      console.error('Firebase getUserByEmail error:', err);
      throw err;
    });
    if (existingUser) {
      console.log('Email already in use:', email);
      return res.status(400).json({ success: false, error: 'Email already in use. Log in instead.' });
    }

    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
    }).catch(err => {
      console.error('Firestore set OTP error:', err);
      throw err;
    });

    await sendOTPEmail(email, otp);
    console.log('OTP sent successfully for email:', email);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Registration endpoint error:', err.message || err);
    res.status(400).json({ success: false, error: err.message || 'Registration failed' });
  }
});

// Resend OTP endpoint
router.post('/resend-otp', async (req, res) => {
  console.log('Raw resend OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email) {
    console.error('No email received in resend OTP request');
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { email } = req.body;

  try {
    if (!validateEmail(email)) throw new Error('Invalid email format.');

    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
    }).catch(err => {
      console.error('Firestore set OTP error:', err);
      throw err;
    });

    await sendOTPEmail(email, otp);
    console.log('New OTP sent successfully for email:', email);
    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to resend OTP.' });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp', async (req, res) => {
  console.log('Raw verify OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email || !req.body.otp) {
    console.error('Missing email or OTP in verify request');
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  const { email, otp, firstName, lastName, password, phoneNumber, username } = req.body;

  try {
    if (!firstName?.trim()) throw new Error('First name is required.');
    if (!lastName?.trim()) throw new Error('Last name is required.');
    if (!validateEmail(email)) throw new Error('Invalid email format.');
    if (!otp) throw new Error('OTP is required.');
    if (!password) throw new Error('Password is required.');
    if (!validatePassword(password)) throw new Error('Password must have 6+ chars, a letter, a number, and a special char.');

    const otpDoc = await adminDb.collection('otps').doc(email).get().catch(err => {
      console.error('Firestore get OTP error:', err);
      throw err;
    });
    if (!otpDoc.exists || otpDoc.data().otp !== otp || otpDoc.data().expires.toDate() < new Date()) {
      console.log('Invalid or expired OTP for email:', email);
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: username,
    }).catch(err => {
      console.error('Firebase createUser error:', err);
      throw err;
    });

    const userData = {
      email,
      name: `${firstName} ${lastName}`,
      username,
      address: '',
      phoneNumber: phoneNumber || '',
      createdAt: new Date().toISOString(),
      uid: userRecord.uid,
      profileImage: null,
    };
    await adminDb.collection('users').doc(userRecord.uid).set(userData).catch(err => {
      console.error('Firestore set user data error:', err);
      throw err;
    });

    await adminDb.collection('notifications').add({
      type: 'user_signup',
      message: `New user signed up: ${email}`,
      createdAt: adminDb.FieldValue.serverTimestamp(),
      details: { user_id: userRecord.uid, email },
    }).catch(err => {
      console.error('Firestore add notification error:', err);
      throw err;
    });

    await adminDb.collection('otps').doc(email).delete().catch(err => {
      console.error('Firestore delete OTP error:', err);
      throw err;
    });
    await adminAuth.generateEmailVerificationLink(email).catch(err => {
      console.error('Firebase email verification link error:', err);
      throw err;
    });

    console.log('User created successfully for email:', email);
    res.json({ success: true, message: 'Account created successfully.' });
  } catch (err) {
    console.error('Verify OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Account creation failed.' });
  }
});

module.exports = router;