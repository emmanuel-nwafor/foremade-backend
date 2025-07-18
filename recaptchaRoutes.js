const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * @swagger
 * /verify-recaptcha:
 *   post:
 *     summary: Verify reCAPTCHA token
 *     description: Verify a reCAPTCHA token with Google's verification service
 *     tags: [Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: reCAPTCHA token from client-side
 *                 example: "03AFcWeA6r..."
 *     responses:
 *       200:
 *         description: reCAPTCHA verification successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 score:
 *                   type: number
 *                   description: reCAPTCHA score (0.0 to 1.0)
 *                   example: 0.9
 *       400:
 *         description: reCAPTCHA verification failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: Error message
 *                 details:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Error codes from Google
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: Error message
 *                 details:
 *                   type: string
 *                   description: Error details
 */
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