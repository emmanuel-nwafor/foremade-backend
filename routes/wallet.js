const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { upload } = require('../middleware/upload');
const { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } = require('firebase/firestore');
const axios = require('axios');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// /initiate-seller-payout
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

// /verify-bank-account
router.post('/verify-bank-account', async (req, res) => {
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

// /fetch-banks
router.get('/fetch-banks', async (req, res) => {
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

module.exports = router;