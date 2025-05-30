require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
// Add Firestore imports for webhook 
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } = require('firebase/firestore');

// Firebase config (replace with your actual config)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// Log env vars for debugging
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('DOMAIN:', process.env.DOMAIN ? process.env.DOMAIN : 'Missing');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, JPG, PNG, WEBP, GIF) and videos (MP4) are allowed.'));
    }
  },
});

// Configure CORS to allow all origins for now
app.use(cors({
  origin: '*', // Allows all origins temporarily
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Updated /upload endpoint to handle both images and videos
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const isVideo = req.body.isVideo === 'true';
    const uploadOptions = {
      folder: 'products',
      resource_type: isVideo ? 'video' : 'image',
    };

    // Validate file size and type (already handled by multer, but double-check)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url, message: `${isVideo ? 'Video' : 'Image'} uploaded successfully` });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: `Failed to upload ${req.body.isVideo === 'true' ? 'video' : 'image'}`,
      details: error.message,
    });
  }
});

// Existing endpoint: Create Stripe payment intent
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

// Existing endpoint: Initiate Paystack payment
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

// Existing endpoint: Create Stripe checkout session for deposits
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'ngn',
            product_data: {
              name: 'Wallet Deposit',
            },
            unit_amount: amount, // Amount in kobo (NGN cents)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.DOMAIN}/wallet?success=true`,
      cancel_url: `${process.env.DOMAIN}/wallet?cancelled=true`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
  }
});

// Existing endpoint: Stripe webhook for events
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const amount = session.amount_total / 100; // Convert back to NGN
      const userId = session.metadata.userId; // Assumes userId is passed in metadata

      if (userId) {
        const walletRef = doc(db, 'wallets', userId);
        const walletSnap = await getDoc(walletRef);
        const currentBalance = walletSnap.data()?.availableBalance || 0;

        await updateDoc(walletRef, {
          availableBalance: currentBalance + amount,
          updatedAt: serverTimestamp(),
        });

        await addDoc(collection(db, 'transactions'), {
          userId: userId,
          type: 'Deposit',
          description: 'Deposit via Stripe',
          amount: amount,
          date: new Date().toISOString().split('T')[0],
          status: 'Completed',
          createdAt: serverTimestamp(),
        });
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});