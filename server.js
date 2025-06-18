require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initializeFirebase } = require('./config/firebase');
const { configureCloudinary } = require('./config/cloudinary');

const app = express();
const db = initializeFirebase();
configureCloudinary();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Log env vars for debugging
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('DOMAIN:', process.env.DOMAIN ? process.env.DOMAIN : 'Missing');

// Mount routes
app.use('/api', require('./routes/wallet'));
app.use('/api', require('./routes/product'));
app.use('/api', require('./routes/payment'));
app.use('/api', require('./routes/onboarding'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});