const express = require('express');
const axios = require('axios');
const router = express.Router();

// /verify-recaptcha endpoint
router.post('/verify-recaptcha', async (req, res) => {
  console.log('reCAPTCHA request:', req.body);
  const { token } = req.body;
  if (!token) {
    console.error('No reCAPTCHA token provided');
    return res.status(400).json({ success: false, error: 'No reCAPTCHA token provided' });
  }
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    console.error('RECAPTCHA_SECRET_KEY missing');
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }
  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: token,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log('Google response:', response.data);
    if (response.data.success) {
      return res.json({ success: true, score: response.data.score });
    }
    return res.status(400).json({ success: false, error: 'reCAPTCHA verification failed', details: response.data['error-codes'] || [] });
  } catch (error) {
    console.error('reCAPTCHA error:', error.message, error.response?.data);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
});

module.exports = router;