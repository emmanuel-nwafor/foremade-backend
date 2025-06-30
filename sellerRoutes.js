const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, serverTimestamp, updateDoc } = require('firebase/firestore');
const router = express.Router();

// /onboard-seller endpoint
router.post('/onboard-seller', async (req, res) => {
  try {
    const { userId, bankCode, accountNumber, country, email, iban, bankName } = req.body;
    if (!userId || !country) {
      return res.status(400).json({ error: 'Missing userId or country' });
    }

    if (country === 'Nigeria') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Missing bankCode or accountNumber for Nigeria' });
      }
      const verifyResponse = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!verifyResponse.data.status) {
        throw new Error(`Failed to verify bank account: ${verifyResponse.data.message || 'Invalid details'}`);
      }
    } else if (country === 'United Kingdom') {
      if (!iban || !bankName || !email) {
        return res.status(400).json({ error: 'Missing iban, bankName, or email for UK' });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }

    const sellerRef = doc(db, 'sellers', userId);
    const sellerSnap = await getDoc(sellerRef);
    const dataToUpdate = {
      country,
      bankCode: country === 'Nigeria' ? bankCode : '',
      accountNumber: country === 'Nigeria' ? accountNumber : '',
      iban: country === 'United Kingdom' ? iban : '',
      email: country === 'United Kingdom' ? email : '',
      updatedAt: serverTimestamp(),
    };

    // Fetch bank name for Nigeria if not provided
    if (country === 'Nigeria' && !bankName) {
      try {
        const bankResponse = await axios.get('https://api.paystack.co/bank', {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const bank = bankResponse.data.data.find((b) => b.code === bankCode);
        dataToUpdate.bankName = bank ? bank.name : 'Unknown Bank';
      } catch (bankError) {
        console.warn('Failed to fetch bank name, using default:', bankError.message);
        dataToUpdate.bankName = 'Unknown Bank';
      }
    } else {
      dataToUpdate.bankName = bankName || '';
    }

    // Use setDoc if document doesn't exist, fall back to updateDoc
    if (!sellerSnap.exists()) {
      await setDoc(sellerRef, {
        ...dataToUpdate,
        createdAt: serverTimestamp(),
      }, { merge: true });
    } else {
      await updateDoc(sellerRef, dataToUpdate);
    }

    res.json({ status: 'success', message: 'Seller onboarded' });
  } catch (error) {
    console.error('Onboarding error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message || 'Unknown error' });
  }
});

// New /process-withdrawal endpoint for withdrawal processing
router.post('/process-withdrawal', async (req, res) => {
  try {
    const { amount, currency, sellerId, orderId, handlingFee, buyerProtectionFee, taxFee } = req.body;

    if (!amount || !sellerId || !orderId || !currency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const totalFees = handlingFee + buyerProtectionFee + taxFee;
    const sellerAmount = amount - totalFees;

    // Update seller's wallet in Firestore
    const walletRef = doc(db, 'wallets', sellerId);
    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      if (!walletDoc.exists) {
        throw new Error('Seller wallet not found');
      }
      const newPendingBalance = (walletDoc.data().pendingBalance || 0) - sellerAmount;
      if (newPendingBalance < 0) {
        throw new Error('Insufficient pending balance');
      }
      transaction.update(walletRef, { pendingBalance: newPendingBalance });
    });

    // Paystack transfer to seller's account
    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerDoc = await getDoc(sellerRef);
    if (!sellerDoc.exists) {
      throw new Error('Seller details not found');
    }
    const sellerData = sellerDoc.data();
    const paystackPayload = {
      source: 'balance',
      amount: Math.round(sellerAmount * 100), // Convert to kobo
      recipient: sellerData.accountNumber || sellerData.iban, // Use accountNumber for NG, iban for UK
      reason: `Withdrawal ${orderId} for ${sellerId}`,
    };

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transfer',
      paystackPayload,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    if (paystackResponse.data.status) {
      console.log('Withdrawal processed:', paystackResponse.data.data);
      res.status(200).json({ message: 'Withdrawal processed successfully', sellerAmount, feesPaid: totalFees });
    } else {
      throw new Error('Paystack transfer failed');
    }
  } catch (error) {
    console.error('Withdrawal processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function createRecipient(bankCode, accountNumber, name) {
  // ... (unchanged)
}

module.exports = router;