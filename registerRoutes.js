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
    console.log('Email sent successfully to:', email);
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
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const otpRef = doc(collection(db, 'otps'), email);
    await setDoc(otpRef, {
      otp,
      expires,
      createdAt: serverTimestamp(), // Client SDK serverTimestamp
    });
    console.log('OTP document set:', { email, otp, expires });

    await sendOTPEmail(email, otp);
    console.log('OTP sent successfully for email:', email);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Send OTP error:', err.message || err);
    res.status(500).json({ success: false, error: 'Failed to send OTP. Please try again.' });
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
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    await updateDoc(doc(db, 'otps', email), {
      otp,
      expires,
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
    res.status(500).json({ success: false, error: 'Failed to resend OTP. Please try again.' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  console.log('Verify OTP request received:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email || !req.body.otp) {
    console.log('Missing data:', req.body);
    return res.status(400).json({ success: false, error: 'Email and verification code are required' });
  }

  const { email, otp } = req.body;

  try {
    if (!validateEmail(email)) {
      console.log('Invalid email format:', email);
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const otpDoc = await getDoc(doc(db, 'otps', email)).catch(err => {
      console.error('Firestore get OTP error:', err);
      throw err;
    });
    console.log('OTP document data:', otpDoc.exists() ? otpDoc.data() : 'Not found');

    if (!otpDoc.exists()) {
      console.log('No OTP document for email:', email);
      return res.status(400).json({ success: false, error: 'No verification code found. Please request a new one.' });
    }

    const otpData = otpDoc.data();
    console.log('Comparing OTPs:', { stored: otpData.otp, provided: otp });
    console.log('Expiration check:', { storedExpires: otpData.expires, currentTime: new Date(), isExpired: otpData.expires < new Date() });

    if (otpData.otp !== otp) {
      console.log('OTP mismatch:', { stored: otpData.otp, provided: otp });
      return res.status(400).json({ success: false, error: 'Incorrect verification code. Please try again.' });
    }

    // Add a 30-second buffer to account for potential delays
    const currentTimeWithBuffer = new Date(Date.now() + 30 * 1000);
    if (otpData.expires < currentTimeWithBuffer) {
      console.log('OTP expired with buffer:', { storedExpires: otpData.expires, currentTime: currentTimeWithBuffer });
      await deleteDoc(doc(db, 'otps', email)).catch(err => console.error('Failed to delete expired OTP:', err));
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    await deleteDoc(doc(db, 'otps', email)).catch(err => {
      console.error('Firestore delete OTP error:', err);
      throw err;
    });

    console.log('OTP verified successfully for email:', email);
    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    console.error('Verify OTP error:', err.message || err);
    res.status(500).json({ success: false, error: 'Verification failed due to a server issue. Please try again later.' });
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
      return res.json({ success: false, error: 'Email not yet verified. Please check your verification code.' });
    }

    res.json({ success: true, message: 'Email verified.' });
  } catch (err) {
    console.error('Verify OTP status error:', err.message || err);
    res.status(500).json({ success: false, error: 'Failed to check verification status. Please try again later.' });
  }
});

module.exports = router;