const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } = require('firebase/firestore');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const crypto = require('crypto');

const ADMIN_STRIPE_ACCOUNT_ID = process.env.ADMIN_STRIPE_ACCOUNT_ID;

// /create-payment-intent
router.post('/create-payment-intent', async (req, res) => {
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

// /paystack-webhook
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

// /verify-paystack-payment
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

// /initiate-paystack-payment
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

// /api/create-checkout-session
router.post('/api/create-checkout-session', async (req, res) => {
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

module.exports = router;