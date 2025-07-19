const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const emailService = require('./emailService');

const ADMIN_STRIPE_ACCOUNT_ID = process.env.ADMIN_STRIPE_ACCOUNT_ID;

console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('DOMAIN:', process.env.DOMAIN ? process.env.DOMAIN : 'Missing');

/**
 * @swagger
 * /create-payment-intent:
 *   post:
 *     summary: Create a Stripe payment intent for UK payments
 *     description: Creates a payment intent for processing payments in the UK using Stripe
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Payment amount in cents
 *                 example: 5000
 *               currency:
 *                 type: string
 *                 default: gbp
 *                 example: gbp
 *               metadata:
 *                 type: object
 *                 description: Additional payment metadata
 *                 example: { sellerId: "seller123", handlingFee: 100, buyerProtectionFee: 50, taxFee: 25 }
 *     responses:
 *       200:
 *         description: Payment intent created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret:
 *                   type: string
 *                   description: Client secret for completing payment
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/create-payment-intent', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }
    const { amount, currency = 'gbp', metadata } = req.body;
    if (!amount || amount <= 0 || !metadata.sellerId) {
      return res.status(400).json({ error: 'Invalid amount or missing sellerId' });
    }
    const adminBankRef = doc(db, 'admin', 'bank');
    const adminBankSnap = await getDoc(adminBankRef);
    if (!adminBankSnap.exists() || adminBankSnap.data().country !== 'United Kingdom') {
      return res.status(500).json({ error: 'Admin bank not configured for UK' });
    }
    const totalAmountInCents = Math.round(amount);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountInCents,
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

/**
 * @swagger
 * /paystack-webhook:
 *   post:
 *     summary: Handle Paystack webhook events
 *     description: Processes Paystack webhook events for Nigeria payments
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 description: Webhook event type
 *                 example: "charge.success"
 *               data:
 *                 type: object
 *                 properties:
 *                   reference:
 *                     type: string
 *                     example: "ref_1234567890"
 *                   amount:
 *                     type: number
 *                     example: 500000
 *                   metadata:
 *                     type: object
 *                     example: { sellerId: "seller123", handlingFee: 1000, buyerProtectionFee: 500, taxFee: 250 }
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *       400:
 *         description: Invalid webhook signature
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/paystack-webhook', async (req, res) => {
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
      const adminFees = (metadata.handlingFee || 0) + (metadata.buyerProtectionFee || 0) + (metadata.taxFee || 0);
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
      const adminBankRef = doc(db, 'admin', 'bank');
      const adminBankSnap = await getDoc(adminBankRef);
      if (!adminBankSnap.exists()) {
        throw new Error('Admin bank not configured');
      }
      const adminBank = adminBankSnap.data();
      const adminTransfer = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: adminFees,
          recipient: await createRecipient(adminBank.bankCode, adminBank.accountNumber, 'Admin Fees'),
          reason: `Admin fees for transaction ${reference}`,
          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!adminTransfer.data.status) {
        throw new Error('Failed to transfer admin fees');
      }
      await updateDoc(walletRef, {
        pendingBalance: (walletData.pendingBalance || 0) + netAmount,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(transactionDoc, {
        status: 'Completed',
        updatedAt: serverTimestamp(),
        adminTransferReference: adminTransfer.data.data.reference,
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

/**
 * @swagger
 * /verify-paystack-payment:
 *   post:
 *     summary: Verify Paystack payment
 *     description: Verifies a Paystack payment for Nigeria
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *             properties:
 *               reference:
 *                 type: string
 *                 description: Payment reference
 *                 example: "ref_1234567890"
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   description: Paystack payment details
 *       400:
 *         description: Invalid request or payment not successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/verify-paystack-payment', async (req, res) => {
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

/**
 * @swagger
 * /initiate-paystack-payment:
 *   post:
 *     summary: Initiate a Paystack payment for Nigeria
 *     description: Creates a payment session for processing payments in Nigeria using Paystack
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - email
 *               - metadata
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Payment amount in kobo
 *                 example: 500000
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Customer email address
 *                 example: "customer@example.com"
 *               currency:
 *                 type: string
 *                 default: NGN
 *                 example: NGN
 *               metadata:
 *                 type: object
 *                 description: Payment metadata including seller ID
 *                 example: { sellerId: "seller123", handlingFee: 1000, buyerProtectionFee: 500, taxFee: 250 }
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authorizationUrl:
 *                   type: string
 *                   description: URL to redirect customer for payment
 *                 reference:
 *                   type: string
 *                   description: Payment reference number
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/initiate-paystack-payment', async (req, res) => {
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

/**
 * @swagger
 * /payment-callback:
 *   get:
 *     summary: Handle Paystack payment callback
 *     description: Processes the callback from Paystack after payment
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: reference
 *         schema:
 *           type: string
 *         required: true
 *         description: Payment reference
 *         example: "ref_1234567890"
 *     responses:
 *       302:
 *         description: Redirects to order confirmation or checkout with error
 */
router.get('/payment-callback', async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res.redirect('/checkout?error=Missing reference');
    }
    const response = await axios.post(
      'https://foremade-backend.onrender.com/verify-paystack-payment',
      { reference },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    if (response.data.status === 'success') {
      await updateDoc(doc(db, 'orders', reference), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });
      try {
        const orderRef = doc(db, 'orders', reference);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          await emailService.sendOrderConfirmationSimpleEmail({
            email: orderData.email,
            orderNumber: reference,
            name: orderData.name || undefined
          });
        }
      } catch (emailErr) {
        console.error('Failed to send order confirmation email:', emailErr);
      }
      res.redirect('/order-confirmation?success=true');
    } else {
      res.redirect(`/checkout?error=${encodeURIComponent(response.data.error)}`);
    }
  } catch (error) {
    console.error('Payment callback error:', error);
    res.redirect(`/checkout?error=${encodeURIComponent(error.response?.data?.details || 'Payment verification failed')}`);
  }
});

/**
 * @swagger
 * /get-product-price:
 *   get:
 *     summary: Get product price in user's local currency
 *     description: Returns product price converted to user's local currency based on location
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: price
 *         schema:
 *           type: number
 *         required: true
 *         description: Product price in NGN
 *         example: 50000
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: User's country code (e.g., NG, GB, US)
 *         example: GB
 *     responses:
 *       200:
 *         description: Price converted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 originalPrice:
 *                   type: number
 *                   description: Original price in NGN
 *                 convertedPrice:
 *                   type: number
 *                   description: Converted price in user's currency
 *                 currency:
 *                   type: string
 *                   description: User's currency code
 *                 symbol:
 *                   type: string
 *                   description: Currency symbol
 *                 formattedPrice:
 *                   type: string
 *                   description: Formatted price with symbol
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/get-product-price', (req, res) => {
  try {
    const { price } = req.query;
    const { convertCurrency, formatCurrency } = require('./middleware');
    
    if (!price || isNaN(price)) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const originalPrice = parseFloat(price);
    const userCurrency = req.userCurrency;
    
    const convertedPrice = convertCurrency(originalPrice, 'NGN', userCurrency.code);
    const formattedPrice = formatCurrency(convertedPrice, userCurrency.code);

    res.json({
      originalPrice,
      convertedPrice,
      currency: userCurrency.code,
      symbol: userCurrency.symbol,
      formattedPrice,
      country: userCurrency.country
    });
  } catch (error) {
    console.error('Currency conversion error:', error);
    res.status(500).json({ error: 'Failed to convert currency', details: error.message });
  }
});

async function createRecipient(bankCode, accountNumber, name) {
  const response = await axios.post(
    'https://api.paystack.co/transferrecipient',
    {
      type: 'nuban',
      name,
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
  if (!response.data.status) {
    throw new Error('Failed to create transfer recipient');
  }
  return response.data.data.recipient_code;
}

module.exports = router;