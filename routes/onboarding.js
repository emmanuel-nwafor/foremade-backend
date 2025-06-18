const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { doc, updateDoc } = require('firebase/firestore');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// /onboard-seller
router.post('/onboard-seller', async (req, res) => {
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

module.exports = router;