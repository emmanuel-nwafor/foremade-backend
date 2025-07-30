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

  await transporter.sendMail(mailOptions);
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => {
  const hasLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password); // Should catch 'Bi' in '@2110244500Bi'
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[_@!+=#$%^&*()[\]{}|;:,.<>?~`/-]/.test(password);
  console.log('Password validation:', { password, hasLength, hasLetter, hasNumber, hasSpecialChar });
  return hasLength && hasLetter && hasNumber && hasSpecialChar;
};

// Register endpoint
router.post('/register', async (req, res) => {
  console.log('Received register request:', req.body);
  const { firstName, lastName, email, password, phoneNumber, username } = req.body;

  if (!firstName?.trim() || !lastName?.trim() || !validateEmail(email) || !password || !validatePassword(password)) {
    console.error('Validation failed:', { firstName, lastName, email, password, phoneNumber, username });
    return res.status(400).json({ success: false, error: 'Invalid input data. Missing required fields or invalid password.' });
  }

  try {
    const existingUser = await adminAuth.getUserByEmail(email).catch(() => null);
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
    });

    await sendOTPEmail(email, otp);
    console.log('OTP sent successfully for email:', email);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP. Try again.' });
  }
});

// Resend OTP endpoint
router.post('/resend-otp', async (req, res) => {
  console.log('Received resend OTP request:', req.body);
  const { email } = req.body;

  if (!validateEmail(email)) {
    console.error('Invalid email for resend:', email);
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }

  try {
    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
    });

    await sendOTPEmail(email, otp);
    console.log('New OTP sent successfully for email:', email);
    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ success: false, error: 'Failed to resend OTP.' });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp', async (req, res) => {
  console.log('Received verify OTP request:', req.body);
  const { email, otp, firstName, lastName, password, phoneNumber, username } = req.body;

  if (!validateEmail(email) || !otp || !firstName?.trim() || !lastName?.trim() || !password || !validatePassword(password)) {
    console.error('Validation failed for verify:', { email, otp, firstName, lastName, password, phoneNumber, username });
    return res.status(400).json({ success: false, error: 'Invalid input data. Missing required fields or invalid password.' });
  }

  try {
    const otpDoc = await adminDb.collection('otps').doc(email).get();
    if (!otpDoc.exists || otpDoc.data().otp !== otp || otpDoc.data().expires.toDate() < new Date()) {
      console.log('Invalid or expired OTP for email:', email);
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: username, // Use frontend-generated username
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
    await adminDb.collection('users').doc(userRecord.uid).set(userData);

    await adminDb.collection('notifications').add({
      type: 'user_signup',
      message: `New user signed up: ${email}`,
      createdAt: adminDb.FieldValue.serverTimestamp(),
      details: { user_id: userRecord.uid, email },
    });

    await adminDb.collection('otps').doc(email).delete();
    await adminAuth.generateEmailVerificationLink(email);

    console.log('User created successfully for email:', email);
    res.json({ success: true, message: 'Account created successfully.' });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ success: false, error: 'Account creation failed.' });
  }
});

module.exports = router;