const express = require('express');
const axios = require('axios');
const router = express.Router();

// /verify-bank-account endpoint
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

// /fetch-banks endpoint
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