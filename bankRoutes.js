const express = require('express');
const axios = require('axios');
const { db } = require('./firebaseConfig');
const { doc, setDoc, getDoc } = require('firebase/firestore');
const router = express.Router();

router.post('/admin-bank', async (req, res) => {
  try {
    const { country, bankCode, accountNumber, iban, bankName } = req.body;
    if (country === 'Nigeria' && (!bankCode || !accountNumber)) {
      return res.status(400).json({ error: 'Bank code and account number required for Nigeria' });
    }
    if (country === 'United Kingdom' && (!iban || !bankName)) {
      return res.status(400).json({ error: 'IBAN and bank name required for UK' });
    }
    await setDoc(doc(db, 'admin', 'bank'), { country, bankCode, accountNumber, iban, bankName });
    res.json({ message: 'Admin bank details saved' });
  } catch (error) {
    console.error('Admin bank error:', error);
    res.status(500).json({ error: 'Failed to save admin bank details', details: error.message });
  }
});

router.get('/fetch-banks', async (req, res) => {
  try {
    console.log('Fetching banks, PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY); // Debug
    const response = await axios.get('https://api.paystack.co/bank?country=nigeria', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    if (!response.data.status) {
      throw new Error('Failed to fetch banks');
    }
    res.json(response.data.data);
  } catch (error) {
    console.error('Fetch banks error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch banks', details: error.message });
  }
});

router.post('/verify-bank-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Account number and bank code required' });
    }
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );
    if (!response.data.status) {
      throw new Error('Account verification failed');
    }
    res.json(response.data.data);
  } catch (error) {
    console.error('Verify bank error:', error);
    res.status(500).json({ error: 'Failed to verify bank account', details: error.response?.data?.message || error.message });
  }
});

module.exports = router;