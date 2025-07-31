const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db } = require('./firebaseConfig'); // Use client SDK Firestore
const { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } = require('firebase/firestore'); // Client SDK imports

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
    subject: 'Your OTP for Login Verification',
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

// Send OTP before login
router.post('/send-otp', async (req, res) => {
  console.log('Send OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { email } = req.body;

  try {
    if (!validateEmail(email)) throw new Error('Invalid email format.');

    const otp = generateOTP();
    const otpRef = doc(collection(db, 'otps'), email);
    await setDoc(otpRef, {
      otp,
      expires: new Date(Date.now() + 10 * 60 * 1000), // Plain JavaScript Date
      createdAt: serverTimestamp(), // Client SDK serverTimestamp
    }).catch(err => {
      console.error('Firestore set OTP error:', err);
      throw err;
    });

    await sendOTPEmail(email, otp);
    console.log('OTP sent successfully for email:', email);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Send OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to send OTP.' });
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

    const otpDoc = await getDoc(doc(db, 'otps', email));
    if (!otpDoc.exists()) throw new Error('No pending verification for this email.');

    const otp = generateOTP();
    await updateDoc(doc(db, 'otps', email), {
      otp,
      expires: new Date(Date.now() + 10 * 60 * 1000), // Plain JavaScript Date
      createdAt: serverTimestamp(), // Client SDK serverTimestamp
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

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  console.log('Verify OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email || !req.body.otp) {
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  const { email, otp } = req.body;

  try {
    const otpDoc = await getDoc(doc(db, 'otps', email)).catch(err => {
      console.error('Firestore get OTP error:', err);
      throw err;
    });
    if (!otpDoc.exists() || otpDoc.data().otp !== otp || otpDoc.data().expires < new Date()) {
      console.log('Invalid or expired OTP for email:', email);
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    await deleteDoc(doc(db, 'otps', email)).catch(err => {
      console.error('Firestore delete OTP error:', err);
      throw err;
    });

    console.log('OTP verified successfully for email:', email);
    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    console.error('Verify OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Verification failed.' });
  }
});

// Check OTP verification status
router.post('/verify-otp-status', async (req, res) => {
  console.log('Verify OTP status request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { email } = req.body;

  try {
    if (!validateEmail(email)) throw new Error('Invalid email format.');

    const otpDoc = await getDoc(doc(db, 'otps', email));
    if (otpDoc.exists()) {
      return res.json({ success: false, error: 'Email not yet verified. Please check your OTP.' });
    }

    res.json({ success: true, message: 'Email verified.' });
  } catch (err) {
    console.error('Verify OTP status error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to check verification status.' });
  }
});

module.exports = router;