const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } = require('firebase/firestore');
const router = express.Router();

// /onboard-seller endpoint
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

// /initiate-seller-payout endpoint
router.post('/initiate-seller-payout', async (req, res) => {
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

    await updateDoc(walletRef, {
      availableBalance: wallet.availableBalance - amount,
      pendingBalance: (wallet.pendingBalance || 0) + amount,
      updatedAt: serverTimestamp(),
    });

    const transactionDoc = await addDoc(collection(db, 'transactions'), {
      userId: sellerId,
      type: 'Withdrawal',
      description: `Withdrawal request for transaction ${transactionReference} - Awaiting Admin Approval`,
      amount,
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
router.post('/approve-payout', async (req, res) => {
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
      const onboardingResponse = await axios.post('http://localhost:5000/api/onboard-seller', {
        userId: sellerId,
        bankCode: transaction.bankCode,
        accountNumber: transaction.accountNumber,
        country,
      });
      if (onboardingResponse.data.error) throw new Error(onboardingResponse.data.error);
    } else if (!seller.stripeAccountId && country === 'United Kingdom') {
      const onboardingResponse = await axios.post('http://localhost:5000/api/onboard-seller', {
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

    if (updatedSeller.country === 'Nigeria') {
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
    } else if (updatedSeller.country === 'United Kingdom') {
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
router.post('/reject-payout', async (req, res) => {
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

module.exports = router;