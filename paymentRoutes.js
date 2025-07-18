const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const crypto = require('crypto');
const { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } = require('firebase/firestore');
const router = express.Router();
const emailService = require('./emailService');

const ADMIN_STRIPE_ACCOUNT_ID = process.env.ADMIN_STRIPE_ACCOUNT_ID;

// Log env vars for debugging
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
// /create-payment-intent endpoint (for UK - Stripe)
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
 *                 example: customer@example.com
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
// /initiate-paystack-payment endpoint (for Nigeria - Paystack)
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
      // Send order confirmation email (simple)
      try {
        // Fetch order details for email
        const orderRef = doc(db, 'orders', reference);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          // Use orderData.email and orderData.orderNumber (or reference)
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
 *   post:
 *     summary: Get product price in user's local currency
 *     description: Returns product price converted to user's local currency based on location
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - price
 *             properties:
 *               price:
 *                 type: number
 *                 description: Product price in NGN (base currency)
 *                 example: 50000
 *               country:
 *                 type: string
 *                 description: User's country code (e.g., NG, GB, US)
 *                 example: GB
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
// Example route showing currency conversion
router.get('/get-product-price', (req, res) => {
  try {
    const { price } = req.query;
    const { convertCurrency, formatCurrency } = require('./middleware');
    
    if (!price || isNaN(price)) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const originalPrice = parseFloat(price);
    const userCurrency = req.userCurrency;
    
    // Convert price from NGN to user's currency
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

/**
 * @swagger
 * /approve-payout:
 *   post:
 *     summary: Initiate a Paystack payout to a seller
 *     description: Initiates a payout to a seller's bank account, triggering an OTP to the admin's email
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *               - sellerId
 *             properties:
 *               transactionId:
 *                 type: string
 *                 description: ID of the transaction to approve
 *                 example: txn_123
 *               sellerId:
 *                 type: string
 *                 description: ID of the seller receiving the payout
 *                 example: seller123
 *     responses:
 *       200:
 *         description: Payout initiated, OTP sent to admin email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Confirmation message
 *                 transferCode:
 *                   type: string
 *                   description: Paystack transfer code for OTP verification
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
router.post('/approve-payout', async (req, res) => {
  const { transactionId, sellerId } = req.body;
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  try {
    // Validate request
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    // Fetch transaction from Firestore
    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transactionData = transactionSnap.data();
    if (transactionData.status !== 'Pending' || transactionData.type !== 'Withdrawal') {
      return res.status(400).json({ error: 'Invalid transaction status or type' });
    }
    const { amount, accountDetails } = transactionData;

    // Get seller's bank details
    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    const { bankCode, accountNumber, fullName } = sellerSnap.data();

    // Create Paystack recipient
    const recipientCode = await createRecipient(bankCode, accountNumber, fullName || 'Seller');

    // Initiate Paystack transfer
    const response = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: Math.round(amount * 100), // Convert NGN to kobo
        recipient: recipientCode,
        reason: `Payout for transaction ${transactionId}`,
        currency: 'NGN',
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status && response.data.data.status === 'otp') {
      // Store transfer_code and update transaction status
      await updateDoc(transactionRef, {
        status: 'pending_otp',
        transferCode: response.data.data.transfer_code,
        updatedAt: serverTimestamp(),
      });
      res.status(200).json({
        message: `OTP sent to admin email for transaction ${transactionId}`,
        transferCode: response.data.data.transfer_code,
      });
    } else {
      throw new Error('Transfer initiation failed');
    }
  } catch (error) {
    console.error('Approve payout error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initiate payout', details: error.response?.data?.message || error.message });
  }
});

/**
 * @swagger
 * /verify-transfer-otp:
 *   post:
 *     summary: Verify OTP to finalize Paystack payout
 *     description: Verifies the OTP sent to the admin to finalize a payout to the seller's bank account
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *               - otp
 *             properties:
 *               transactionId:
 *                 type: string
 *                 description: ID of the transaction to finalize
 *                 example: txn_123
 *               otp:
 *                 type: string
 *                 description: OTP received by the admin
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Payout finalized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Confirmation message
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
router.post('/verify-transfer-otp', async (req, res) => {
  const { transactionId, otp } = req.body;
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  try {
    // Validate request
    if (!transactionId || !otp) {
      return res.status(400).json({ error: 'Missing transactionId or OTP' });
    }

    // Fetch transaction
    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const { transferCode, sellerId, amount } = transactionSnap.data();
    if (!transferCode) {
      return res.status(400).json({ error: 'No transfer code found' });
    }

    // Finalize Paystack transfer
    const response = await axios.post(
      'https://api.paystack.co/transfer/finalize_transfer',
      {
        transfer_code: transferCode,
        otp,
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status && response.data.data.status === 'success') {
      // Update transaction and wallet
      await updateDoc(transactionRef, {
        status: 'Completed',
        completedAt: serverTimestamp(),
      });
      const walletRef = doc(db, 'wallets', sellerId);
      const walletSnap = await getDoc(walletRef);
      if (!walletSnap.exists()) {
        throw new Error('Seller wallet not found');
      }

      // Notify seller via email
      const sellerRef = doc(db, 'sellers', sellerId);
      const sellerSnap = await getDoc(sellerRef);
      if (sellerSnap.exists() && sellerSnap.data().email) {
        await emailService.sendOrderConfirmationSimpleEmail({
          email: sellerSnap.data().email,
          orderNumber: transactionId,
          name: sellerSnap.data().fullName || 'Seller',
          message: `Your payout of ₦${amount.toFixed(2)} for transaction ${transactionId} has been completed.`,
        });
      }

      res.status(200).json({ message: 'Payout completed successfully' });
    } else {
      throw new Error('OTP verification failed');
    }
  } catch (error) {
    console.error('Verify OTP error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to verify OTP', details: error.response?.data?.message || error.message });
  }
});

module.exports = router;