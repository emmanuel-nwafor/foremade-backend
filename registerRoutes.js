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
  return hasLength && hasLetter && hasNumber && hasSpecialChar;
};

// Initiate OTP for signup
router.post('/initiate-otp', async (req, res) => {
  console.log('Initiate OTP request:', JSON.stringify(req.body, null, 2));
  const { firstName, lastName, email, password, phoneNumber, username } = req.body;

  try {
    if (!firstName?.trim()) throw new Error('First name is required.');
    if (!lastName?.trim()) throw new Error('Last name is required.');
    if (!validateEmail(email)) throw new Error('Invalid email format.');
    if (!password) throw new Error('Password is required.');
    if (!validatePassword(password)) throw new Error('Password must have 6+ chars, a letter, a number, and a special char.');
    if (phoneNumber && !/^\+\d{7,15}$/.test(phoneNumber)) throw new Error('Invalid phone number format.');

    const existingUser = await adminAuth.getUserByEmail(email).catch(err => {
      console.error('Firebase getUserByEmail error:', err);
      throw err;
    });
    if (existingUser) throw new Error('Email already in use. Log in instead.');

    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
      firstName,
      lastName,
      password,
      phoneNumber,
      username,
    }).catch(err => {
      console.error('Firestore set OTP error:', err);
      throw err;
    });

    await sendOTPEmail(email, otp);
    console.log('OTP sent successfully for email:', email);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Initiate OTP error:', err.message || err);
    res.status(400).json({ success: false, error: err.message || 'Failed to initiate OTP.' });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  console.log('Resend OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { email } = req.body;

  try {
    if (!validateEmail(email)) throw new Error('Invalid email format.');

    const otpDoc = await adminDb.collection('otps').doc(email).get();
    if (!otpDoc.exists) throw new Error('No pending registration for this email.');

    const otp = generateOTP();
    await adminDb.collection('otps').doc(email).update({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
    }).catch(err => {
      console.error('Firestore update OTP error:', err);
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

// Verify OTP and create user
router.post('/verify-otp', async (req, res) => {
  console.log('Verify OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email || !req.body.otp) {
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  const { email, otp } = req.body;

  try {
    const otpDoc = await adminDb.collection('otps').doc(email).get().catch(err => {
      console.error('Firestore get OTP error:', err);
      throw err;
    });
    if (!otpDoc.exists || otpDoc.data().otp !== otp || otpDoc.data().expires.toDate() < new Date()) {
      console.log('Invalid or expired OTP for email:', email);
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const { firstName, lastName, password, phoneNumber, username } = otpDoc.data();
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
      phoneNumber: phoneNumber || '',
      createdAt: new Date().toISOString(),
      uid: userRecord.uid,
      profileImage: null,
      role: 'Buyer', // Default role
    };
    await adminDb.collection('users').doc(userRecord.uid).set(userData).catch(err => {
      console.error('Firestore set user data error:', err);
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
    res.json({ success: true, message: 'Account created successfully. Check your email for verification.' });
  } catch (err) {
    console.error('Verify OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Account creation failed.' });
  }
});

module.exports = router;