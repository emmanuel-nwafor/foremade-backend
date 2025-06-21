require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } = require('firebase/firestore');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Firebase config
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
  origin: '*',
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

// Admin Stripe and Paystack account IDs
const ADMIN_STRIPE_ACCOUNT_ID = process.env.ADMIN_STRIPE_ACCOUNT_ID;
const ADMIN_PAYSTACK_RECIPIENT_CODE = process.env.ADMIN_PAYSTACK_RECIPIENT_CODE;

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// /upload endpoint
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

// /create-payment-intent endpoint (for UK - Stripe)
app.post('/create-payment-intent', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }

    const { amount, currency = 'gbp', metadata } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!ADMIN_STRIPE_ACCOUNT_ID) {
      return res.status(500).json({ error: 'Admin Stripe account ID not configured' });
    }

    const totalAmountInCents = Math.round(amount);
    const adminFeesInCents = Math.round((metadata.handlingFee + metadata.buyerProtectionFee + metadata.taxFee) * (currency === 'gbp' ? 100 : 1));
    const sellerId = metadata.sellerId;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountInCents,
      currency,
      metadata,
      application_fee_amount: adminFeesInCents,
      transfer_data: {
        destination: ADMIN_STRIPE_ACCOUNT_ID,
      },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent', details: error.message });
  }
});

// /paystack-webhook endpoint
app.post('/paystack-webhook', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      console.error('Invalid Paystack webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('Paystack webhook event:', event);

    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;
      const amountInKobo = amount;
      const sellerId = metadata.sellerId;
      const adminFees = metadata.adminFees || 0;

      const q = query(
        collection(db, 'transactions'),
        where('reference', '==', reference),
        where('status', '==', 'Initiated')
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        console.warn(`No Initiated transaction found for reference ${reference}`);
        return res.status(200).json({ status: 'success' });
      }

      const transactionDoc = doc(db, 'transactions', querySnapshot.docs[0].id);
      const netAmount = (amountInKobo - adminFees) / 100;

      const walletRef = doc(db, 'wallets', sellerId);
      const walletSnap = await getDoc(walletRef);
      const walletData = walletSnap.exists() ? walletSnap.data() : { availableBalance: 0, pendingBalance: 0 };

      await updateDoc(walletRef, {
        pendingBalance: (walletData.pendingBalance || 0) + netAmount,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(transactionDoc, {
        status: 'Completed',
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'transactions'), {
        userId: sellerId,
        type: 'Sale',
        description: `Sale credited to pending balance for payment ${reference}`,
        amount: netAmount,
        date: new Date().toISOString().split('T')[0],
        status: 'Completed',
        createdAt: serverTimestamp(),
        reference,
      });

      console.log(`Processed charge.success for reference ${reference}: credited ${netAmount} to seller ${sellerId}`);
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

// /verify-paystack-payment endpoint
app.post('/verify-paystack-payment', async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.status || response.data.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful', details: response.data.message });
    }

    const q = query(
      collection(db, 'transactions'),
      where('reference', '==', reference),
      where('status', '==', 'Completed')
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return res.status(400).json({ error: 'Payment not confirmed in system' });
    }

    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error('Paystack verification error:', error);
    res.status(500).json({ error: 'Failed to verify payment', details: error.response?.data?.message || error.message });
  }
});

// /initiate-paystack-payment endpoint (for Nigeria - Paystack)
app.post('/initiate-paystack-payment', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }

    const { amount, email, currency = 'NGN', metadata } = req.body;
    console.log('Paystack Request Payload:', { amount, email, currency, metadata });

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!metadata?.sellerId) {
      return res.status(400).json({ error: 'Seller ID is required in metadata' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Paystack secret key not configured' });
    }

    const adminFees = (metadata?.handlingFee || 0) + (metadata?.buyerProtectionFee || 0) + (metadata?.taxFee || 0);
    const sellerId = metadata.sellerId;
    const reference = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const amountInKobo = Math.round(amount);
    if (isNaN(amountInKobo) || amountInKobo <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const payload = {
      amount: amountInKobo,
      email,
      currency,
      reference,
      metadata: { ...metadata, adminFees },
      channels: ['card', 'bank'],
      callback_url: `${process.env.DOMAIN}/payment-callback`,
    };

    console.log('Paystack Payload Sent:', payload);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Paystack API Response:', response.data);

    if (response.data.status) {
      await addDoc(collection(db, 'transactions'), {
        userId: sellerId,
        type: 'Sale',
        description: `Sale initiated for payment ${reference}`,
        amount: amountInKobo / 100,
        adminFees: adminFees / 100,
        date: new Date().toISOString().split('T')[0],
        status: 'Initiated',
        createdAt: serverTimestamp(),
        reference,
      });

      res.json({
        authorizationUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
      });
    } else {
      throw new Error(`Paystack error: ${response.data.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Paystack payment error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to initiate Paystack payment',
      details: error.response?.data?.message || error.message,
    });
  }
});

// /api/create-checkout-session endpoint
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }

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
            unit_amount: amount,
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

// /onboard-seller endpoint
app.post('/onboard-seller', async (req, res) => {
  try {
    const { userId, bankCode, accountNumber, country, email } = req.body;
    if (!userId || !country) {
      return res.status(400).json({ error: 'Missing userId or country' });
    }

    if (country === 'Nigeria') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Missing bankCode or accountNumber for Nigeria' });
      }

      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: `Seller ${userId}`,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!recipientResponse.data.status) {
        throw new Error('Failed to create Paystack transfer recipient');
      }

      const sellerRef = doc(db, 'sellers', userId);
      await updateDoc(sellerRef, { paystackRecipientCode: recipientResponse.data.data.recipient_code, country });

      res.json({
        recipientCode: recipientResponse.data.data.recipient_code,
      });
    } else if (country === 'United Kingdom') {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.DOMAIN}/seller-onboarding?status=failed`,
        return_url: `${process.env.DOMAIN}/seller-onboarding?status=success`,
        type: 'account_onboarding',
      });

      const sellerRef = doc(db, 'sellers', userId);
      await updateDoc(sellerRef, { stripeAccountId: account.id, country });

      res.json({
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message });
  }
});

// /initiate-seller-payout endpoint
app.post('/initiate-seller-payout', async (req, res) => {
  try {
    const { sellerId, amount, transactionReference, bankCode, accountNumber, country, email } = req.body;
    if (!sellerId || !amount || amount <= 0 || !transactionReference) {
      return res.status(400).json({ error: 'Missing sellerId, amount, or transactionReference' });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found' });
    }
    const wallet = walletSnap.data();

    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance' });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(400).json({ error: 'Seller not found' });
    }
    const seller = sellerSnap.data();

    if (country === 'Nigeria') {
      let recipientCode = seller.paystackRecipientCode;
      if (!recipientCode) {
        const onboardingResponse = await axios.post(`${process.env.DOMAIN}/onboard-seller`, {
          userId: sellerId,
          bankCode,
          accountNumber,
          country,
        });
        if (onboardingResponse.data.error) throw new Error(onboardingResponse.data.error);
        recipientCode = onboardingResponse.data.recipientCode;
      }

      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: `Payout for transaction ${transactionReference}`,
          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!transferResponse.data.status) {
        throw new Error('Failed to initiate Paystack transfer');
      }

      await updateDoc(walletRef, {
        availableBalance: wallet.availableBalance - amount,
        updatedAt: serverTimestamp(),
      });

      const transactionDoc = await addDoc(collection(db, 'transactions'), {
        userId: sellerId,
        type: 'Withdrawal',
        description: `Withdrawal for transaction ${transactionReference}`,
        amount,
        date: new Date().toISOString().split('T')[0],
        status: 'Completed',
        createdAt: serverTimestamp(),
        reference: transactionReference,
        payoutReference: transferResponse.data.data.reference,
        bankCode,
        accountNumber,
        country,
        email,
      });

      res.json({
        status: 'success',
        transactionId: transactionDoc.id,
        reference: transferResponse.data.data.reference,
        message: 'Withdrawal processed successfully',
      });
    } else if (country === 'United Kingdom') {
      let stripeAccountId = seller.stripeAccountId;
      if (!stripeAccountId) {
        const onboardingResponse = await axios.post(`${process.env.DOMAIN}/onboard-seller`, {
          userId: sellerId,
          country,
          email,
        });
        if (onboardingResponse.data.error) throw new Error(onboardingResponse.data.error);
        if (onboardingResponse.data.redirectUrl) {
          return res.json({
            status: 'redirect',
            redirectUrl: onboardingResponse.data.redirectUrl,
          });
        }
        stripeAccountId = onboardingResponse.data.stripeAccountId;
      }

      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        destination: stripeAccountId,
        description: `Payout for transaction ${transactionReference}`,
      });

      await updateDoc(walletRef, {
        availableBalance: wallet.availableBalance - amount,
        updatedAt: serverTimestamp(),
      });

      const transactionDoc = await addDoc(collection(db, 'transactions'), {
        userId: sellerId,
        type: 'Withdrawal',
        description: `Withdrawal for transaction ${transactionReference}`,
        amount,
        date: new Date().toISOString().split('T')[0],
        status: 'Completed',
        createdAt: serverTimestamp(),
        reference: transactionReference,
        transferId: transfer.id,
        country,
        email,
      });

      res.json({
        status: 'success',
        transactionId: transactionDoc.id,
        transferId: transfer.id,
        message: 'Withdrawal processed successfully',
      });
    } else {
      res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Payout initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate seller payout', details: error.message });
  }
});

// /reject-payout endpoint
app.post('/reject-payout', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(400).json({ error: 'Transaction not found' });
    }
    const transaction = transactionSnap.data();

    if (transaction.status !== 'Pending') {
      return res.status(400).json({ error: 'Transaction is not in pending state' });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found' });
    }
    const wallet = walletSnap.data();

    const amount = transaction.amount;

    await updateDoc(walletRef, {
      availableBalance: wallet.availableBalance + amount,
      pendingBalance: wallet.pendingBalance - amount,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(transactionRef, {
      status: 'Rejected',
      updatedAt: serverTimestamp(),
    });

    res.json({
      status: 'success',
      message: 'Payout rejected and funds returned to available balance',
    });
  } catch (error) {
    console.error('Payout rejection error:', error);
    res.status(500).json({ error: 'Failed to reject payout', details: error.message });
  }
});

// /verify-bank-account endpoint
app.post('/verify-bank-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Missing accountNumber or bankCode' });
    }

    console.log('Verifying account with PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Key is set' : 'Key is NOT set');
    console.log('Request URL:', `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Paystack Response Status:', response.status);
    console.log('Paystack Response Data:', response.data);

    if (response.data.status) {
      res.json({
        status: 'success',
        accountName: response.data.data.account_name,
      });
    } else {
      res.status(400).json({ error: 'Could not verify account', message: response.data.message });
    }
  } catch (error) {
    console.error('Bank verification error:', error);
    res.status(500).json({
      error: 'Failed to verify bank account',
      details: error.response?.data?.message || error.message,
    });
  }
});

// /fetch-banks endpoint
app.get('/fetch-banks', async (req, res) => {
  try {
    console.log('Fetching banks with PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Key is set' : 'Key is NOT set');
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Paystack Bank Fetch Response Status:', response.status);
    console.log('Paystack Bank Fetch Data:', response.data);

    if (response.data.status) {
      res.json(response.data.data);
    } else {
      throw new Error('Failed to fetch banks');
    }
  } catch (error) {
    console.error('Fetch banks error:', error);
    res.status(500).json({ error: 'Failed to fetch banks', details: error.response?.data?.message || error.message });
  }
});

// /verify-recaptcha endpoint
app.post('/verify-recaptcha', async (req, res) => {
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

// /send-product-approved-email endpoint
app.post('/send-product-approved-email', async (req, res) => {
  try {
    const { productId, productName, sellerId, sellerEmail } = req.body;
    console.log('Received payload for product approved email:', { productId, productName, sellerId, sellerEmail });

    if (!productId || !productName || !sellerId) {
      console.warn('Missing required fields:', { productId, productName, sellerId, sellerEmail });
      return res.status(400).json({ error: 'Missing productId, productName, or sellerId' });
    }

    let email = sellerEmail;
    if (!email) {
      const userDoc = await getDoc(doc(db, 'users', sellerId));
      if (!userDoc.exists()) {
        console.warn(`Seller ${sellerId} not found in Firestore`);
        return res.status(400).json({ error: 'Seller not found' });
      }
      email = userDoc.data().email;
      if (!email) {
        console.warn(`No email found for seller ${sellerId}`);
        return res.status(400).json({ error: 'No email found for seller' });
      }
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Verify product exists
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      console.warn(`Product ${productId} not found in Firestore`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const mailOptions = {
      from: `"Your Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: 'Your Product is Live on Foremade! 🎉',
      text: `Great news! Your product "${productName}" (ID: ${productId}) has been approved and is now live on Foremade. Log in to your seller dashboard to manage your listings: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a73e8;">Great news! Your Product is Live! 🎉</h2>
          <p>We’re excited to inform you that your product <strong>"${productName}"</strong> (ID: ${productId}) has been approved by our team and is now live on Foremade!</p>
          <p>Customers can now view and purchase your product on our platform. To manage your listings or view performance, visit your seller dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Seller Dashboard</a>
          <p>Thank you for choosing Foremade. Let’s make those sales soar!</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly. For support, contact us at <a href="mailto:support@foremade.com">support@foremade.com</a>.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Approval email sent to ${email} for product ${productId}`);

    // Update product status in Firestore
    await updateDoc(productRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Approval email sent to seller' });
  } catch (error) {
    console.error('Error sending product approved email:', {
      message: error.message,
      stack: error.stack,
      payload: req.body,
    });
    res.status(500).json({ error: 'Failed to send approval email', details: error.message });
  }
});

// /send-product-rejected-email endpoint
app.post('/send-product-rejected-email', async (req, res) => {
  try {
    const { productId, productName, sellerId, sellerEmail, reason } = req.body;
    console.log('Received payload for product rejected email:', { productId, productName, sellerId, sellerEmail, reason });

    if (!productId || !productName || !sellerId || !reason) {
      console.warn('Missing required fields:', { productId, productName, sellerId, sellerEmail, reason });
      return res.status(400).json({ error: 'Missing productId, productName, sellerId, or reason' });
    }

    let email = sellerEmail;
    if (!email) {
      const userDoc = await getDoc(doc(db, 'users', sellerId));
      if (!userDoc.exists()) {
        console.warn(`Seller ${sellerId} not found in Firestore`);
        return res.status(400).json({ error: 'Seller not found' });
      }
      email = userDoc.data().email;
      if (!email) {
        console.warn(`No email found for seller ${sellerId}`);
        return res.status(400).json({ error: 'No email found for seller' });
      }
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Verify product exists
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      console.warn(`Product ${productId} not found in Firestore`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const mailOptions = {
      from: `"Your Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: 'Update: Your Product Was Not Approved on Foremade',
      text: `Dear Seller, we're sorry to inform you that your product "${productName}" (ID: ${productId}) was not approved for listing on Foremade. Reason: ${reason}. Please review our guidelines and resubmit or contact support for more details: https://foremade.com/support. Log in to your seller dashboard to update your product: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">Update: Your Product Was Not Approved</h2>
          <p>Dear Seller,</p>
          <p>We’re sorry to inform you that your product "<strong>${productName}</strong>" (ID: ${productId}) was not approved for listing on Foremade after our team’s review.</p>
          <p><strong>Reason for Rejection:</strong> ${reason}</p>
          <p>Please review our <a href="https://foremade.com/guidelines" style="color: #1;">seller guidelines</a> to ensure your product meets our standards. You can update and resubmit your product via your seller dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Seller Dashboard</a>
          <p>For further assistance, contact our support team at <a href="mailto:support@foremade.com" style="color: #1a73e8;">support@foremade.com</a>.</p>
          <p>Thank you for being part of Foremade!</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Rejection email sent to ${email} for product ${productId}`);

    // Update product status in Firestore
    await updateDoc(productRef, {
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Rejection email sent to seller' });
  } catch (error) {
    console.error('Error sending product rejected email:', {
      message: error.message,
      stack: error.stack,
      payload: req.body,
    });
    res.status(500).json({ error: 'Failed to send rejection email', details: error.message });
  }
});

app.post('/send-order-confirmation', async (req, res) => {
  try {
    const { orderId, email, items, total, currency } = req.body;
    console.log('Received payload for order confirmation:', {
      orderId,
      email,
      items,
      total,
      currency,
      payload: JSON.stringify(req.body, null, 2),
    });

    // Validate payload
    if (!orderId || !email || !items || !total) {
      console.warn('Missing required fields:', { orderId, email, items, total });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      console.warn('Invalid items array:', items);
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }
    if (typeof total !== 'number' || total <= 0) {
      console.warn('Invalid total amount:', total);
      return res.status(400).json({ error: 'Total must be a positive number' });
    }
    if (!['ngn', 'gbp'].includes(currency?.toLowerCase())) {
      console.warn('Invalid currency:', currency);
      return res.status(400).json({ error: 'Invalid currency' });
    }

    // Validate items structure
    for (const item of items) {
      if (!item.name || !item.quantity || !item.price || !item.imageUrls || !Array.isArray(item.imageUrls)) {
        console.warn('Invalid item structure:', item);
        return res.status(400).json({ error: 'Invalid item structure: missing name, quantity, price, or imageUrls' });
      }
    }

    // Verify order exists in Firebase
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      console.warn(`Order ${orderId} not found in Firestore`);
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemRows = items.map((item) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px;">
          <img src="${item.imageUrls[0] || 'https://via.placeholder.com/50'}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" />
        </td>
        <td style="padding: 10px;">
          ${item.name}
        </td>
        <td style="padding: 10px; text-align: center;">
          ${item.quantity}
        </td>
        <td style="padding: 10px; text-align: right;">
          ${currency.toLowerCase() === 'gbp' ? '£' : '₦'}${(item.price * item.quantity).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: `Order Confirmation - #${orderId}`,
      text: `Thank you for your purchase on Foremade! Your order #${orderId} has been received and is being processed. Total: ${currency.toUpperCase()}${total.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. View your order details: ${process.env.DOMAIN}/order-confirmation?orderId=${orderId}`,
      html: `<p>
              Thank you for shopping with Foremade! 🛒
              Your order #order-123 has been placed.
              View your order here: https://foremade.com/order-confirmation?orderId=order-${orderId}
              Questions? Contact support@foremade.com
              
              Foremade Team 📦
            </p>`, 
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${email} for order ${orderId}`);
    res.json({ status: 'success', message: 'Order confirmation email sent' });
  } catch (error) {
    console.error('Error sending order confirmation email:', {
      message: error.message,
      stack: error.stack,
      payload: JSON.stringify(req.body, null, 2),
    });
    res.status(500).json({ error: 'Failed to send order confirmation email', details: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});