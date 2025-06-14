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

// Admin Stripe and Paystack account IDs (set these in your .env file)
const ADMIN_STRIPE_ACCOUNT_ID = process.env.ADMIN_STRIPE_ACCOUNT_ID;
const ADMIN_PAYSTACK_RECIPIENT_CODE = process.env.ADMIN_PAYSTACK_RECIPIENT_CODE;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
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
    const adminFeesInCents = Math.round((metadata.handlingFee + metadata.buyerProtectionFee) * (currency === 'gbp' ? 100 : 1));
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
      const amountInKobo = amount; // Paystack sends amount in kobo
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
        return res.status(200).json({ status: 'success' }); // Idempotency: skip if already processed
      }

      const transactionDoc = querySnapshot.docs[0];
      const transactionRef = doc(db, 'transactions', transactionDoc.id);
      const netAmount = (amountInKobo - adminFees) / 100; // Convert to NGN

      const walletRef = doc(db, 'wallets', sellerId);
      const walletSnap = await getDoc(walletRef);
      const walletData = walletSnap.exists() ? walletSnap.data() : { availableBalance: 0, pendingBalance: 0 };

      await updateDoc(walletRef, {
        pendingBalance: (walletData.pendingBalance || 0) + netAmount,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(transactionRef, {
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

    // Validate inputs
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

    const adminFees = (metadata?.handlingFee || 0) + (metadata?.buyerProtectionFee || 0);
    const sellerId = metadata.sellerId;
    const reference = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Use amount directly (already in kobo)
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
      // Store transaction as Initiated
      await addDoc(collection(db, 'transactions'), {
        userId: sellerId,
        type: 'Sale',
        description: `Sale initiated for payment ${reference}`,
        amount: amountInKobo / 100, // Store in NGN
        adminFees: adminFees / 100, // Store in NGN
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
      return res.status(400).json({ error: 'Invalid sellerId, amount, or transactionReference' });
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

    await updateDoc(walletRef, {
      availableBalance: wallet.availableBalance - amount,
      pendingBalance: (wallet.pendingBalance || 0) + amount,
      updatedAt: serverTimestamp(),
    });

    const transactionDoc = await addDoc(collection(db, 'transactions'), {
      userId: sellerId,
      type: 'Withdrawal',
      description: `Withdrawal request for transaction ${transactionReference} - Awaiting Admin Approval`,
      amount: amount,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: serverTimestamp(),
      reference: transactionReference,
      bankCode: country === 'Nigeria' ? bankCode : undefined,
      accountNumber: country === 'Nigeria' ? accountNumber : undefined,
      country,
      email,
    });

    res.json({
      status: 'success',
      transactionId: transactionDoc.id,
      message: 'Withdrawal request submitted, awaiting admin approval',
    });
  } catch (error) {
    console.error('Payout initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate seller payout', details: error.message });
  }
});

// /approve-payout endpoint
app.post('/approve-payout', async (req, res) => {
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

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(400).json({ error: 'Seller not found' });
    }
    const seller = sellerSnap.data();

    const country = transaction.country;
    if (!seller.paystackRecipientCode && country === 'Nigeria') {
      const onboardingResponse = await axios.post('http://localhost:5000/onboard-seller', {
        userId: sellerId,
        bankCode: transaction.bankCode,
        accountNumber: transaction.accountNumber,
        country,
      });
      if (onboardingResponse.data.error) throw new Error(onboardingResponse.data.error);
    } else if (!seller.stripeAccountId && country === 'United Kingdom') {
      const onboardingResponse = await axios.post('http://localhost:5000/onboard-seller', {
        userId: sellerId,
        country,
        email: transaction.email,
      });
      if (onboardingResponse.data.error) throw new Error(onboardingResponse.data.error);
      return res.json({
        status: 'redirect',
        redirectUrl: onboardingResponse.data.redirectUrl,
      });
    }

    const updatedSellerSnap = await getDoc(sellerRef);
    const updatedSeller = updatedSellerSnap.data();
    const updatedCountry = updatedSeller.country;

    if (updatedCountry === 'Nigeria') {
      const recipientCode = updatedSeller.paystackRecipientCode;
      if (!recipientCode) {
        return res.status(400).json({ error: 'Seller has not completed Paystack onboarding' });
      }

      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: `Payout for transaction ${transaction.reference}`,
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
        availableBalance: (wallet.availableBalance || 0) + amount,
        pendingBalance: wallet.pendingBalance - amount,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(transactionRef, {
        status: 'Completed',
        updatedAt: serverTimestamp(),
        payoutReference: transferResponse.data.data.reference,
      });

      res.json({
        status: 'success',
        reference: transferResponse.data.data.reference,
      });
    } else if (updatedCountry === 'United Kingdom') {
      const stripeAccountId = updatedSeller.stripeAccountId;
      if (!stripeAccountId) {
        return res.status(400).json({ error: 'Seller has not completed Stripe onboarding' });
      }

      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        destination: stripeAccountId,
        description: `Payout for transaction ${transaction.reference}`,
      });

      await updateDoc(walletRef, {
        availableBalance: (wallet.availableBalance || 0) + amount,
        pendingBalance: wallet.pendingBalance - amount,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(transactionRef, {
        status: 'Completed',
        updatedAt: serverTimestamp(),
      });

      res.json({
        status: 'success',
        transferId: transfer.id,
      });
    } else {
      res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Payout approval error:', error);
    res.status(500).json({ error: 'Failed to approve payout', details: error.message });
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});