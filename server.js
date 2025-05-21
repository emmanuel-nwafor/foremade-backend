require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

// Log env vars for debugging
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('DOMAIN:', process.env.DOMAIN ? process.env.DOMAIN : 'Missing');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Configure CORS with the domain from env
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'products' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });
    res.json({ imageUrl: result.secure_url, message: 'Image uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'gbp', metadata } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent', details: error.message });
  }
});

app.post('/initiate-paystack-payment', async (req, res) => {
  try {
    const { amount, email, currency = 'NGN', metadata } = req.body;
    if (!amount || amount <= 0 || !email) {
      return res.status(400).json({ error: 'Invalid amount or email' });
    }
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        amount: Math.round(amount * 100),
        email,
        currency,
        reference: `ref-${Date.now()}`,
        metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.data.status) {
      res.json({
        authorizationUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
      });
    } else {
      throw new Error('Failed to initialize Paystack transaction');
    }
  } catch (error) {
    console.error('Paystack payment error:', error);
    res.status(500).json({
      error: 'Failed to initiate Paystack payment',
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});