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
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[_@!+=#$%^&*()[\]{}|;:,.<>?~`/-]/.test(password);
  return hasLength && hasLetter && hasNumber && hasSpecialChar;
};
const generateUsername = (firstName, lastName) => {
  const nameParts = [firstName, lastName].filter(part => part?.trim());
  const firstPart = nameParts[0]?.slice(0, 4).toLowerCase() || 'user';
  const secondPart = nameParts[1]?.slice(0, 3).toLowerCase() || '';
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return (firstPart + secondPart).replace(/[^a-z0-9]/g, '') + randomNum;
};

// Register endpoint
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, password, phoneNumber } = req.body;

  if (!firstName.trim() || !lastName.trim() || !validateEmail(email) || !password || !validatePassword(password)) {
    return res.status(400).json({ success: false, error: 'Invalid input data' });
  }

  try {
    const existingUser = await adminAuth.getUserByEmail(email).catch(() => null);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already in use. Log in instead.' });
    }

    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), // 10-minute expiry
      createdAt: adminDb.FieldValue.serverTimestamp(),
    });

    await sendOTPEmail(email, otp);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP. Try again.' });
  }
});

// Resend OTP endpoint
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!validateEmail(email)) {
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
    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ success: false, error: 'Failed to resend OTP.' });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp', async (req, res) => {
  const { email, otp, firstName, lastName, password, phoneNumber } = req.body;

  if (!validateEmail(email) || !otp || !firstName || !lastName || !password || !validatePassword(password)) {
    return res.status(400).json({ success: false, error: 'Invalid input data' });
  }

  try {
    const otpDoc = await adminDb.collection('otps').doc(email).get();
    if (!otpDoc.exists || otpDoc.data().otp !== otp || otpDoc.data().expires.toDate() < new Date()) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: generateUsername(firstName, lastName),
    });

    const userData = {
      email,
      name: `${firstName} ${lastName}`,
      username: generateUsername(firstName, lastName),
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

    await adminDb.collection('otps').doc(email).delete(); // Clean up OTP
    await adminAuth.generateEmailVerificationLink(email);

    res.json({ success: true, message: 'Account created successfully.' });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ success: false, error: 'Account creation failed.' });
  }
});

module.exports = router;