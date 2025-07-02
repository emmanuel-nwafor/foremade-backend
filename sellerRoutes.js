const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection } = require('firebase/firestore');
const router = express.Router();

/**
 * @swagger
 * /onboard-seller:
 *   post:
 *     summary: Onboard seller for payments
 *     description: Set up seller account for receiving payments via Stripe (UK) or Paystack (Nigeria)
 *     tags: [Seller Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - country
 *               - fullName
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID
 *                 example: "user123"
 *               country:
 *                 type: string
 *                 enum: [Nigeria, United Kingdom]
 *                 description: Seller's country
 *                 example: "Nigeria"
 *               fullName:
 *                 type: string
 *                 description: Seller's full name
 *                 example: "John Doe"
 *               bankCode:
 *                 type: string
 *                 description: Bank code (required for Nigeria)
 *                 example: "044"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number (required for Nigeria)
 *                 example: "0123456789"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address (required for UK)
 *                 example: "seller@example.com"
 *               iban:
 *                 type: string
 *                 description: IBAN (required for UK)
 *                 example: "GB33BUKB20201555555555"
 *               bankName:
 *                 type: string
 *                 description: Bank name (required for UK)
 *                 example: "Barclays"
 *               idNumber:
 *                 type: string
 *                 description: ID number (required for UK)
 *                 example: "123456789"
 *     responses:
 *       200:
 *         description: Seller onboarded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recipientCode:
 *                   type: string
 *                   description: Paystack recipient code (Nigeria)
 *                   example: "RCP_1234567890"
 *                 stripeAccountId:
 *                   type: string
 *                   description: Stripe account ID (UK)
 *                   example: "acct_1234567890"
 *                 redirectUrl:
 *                   type: string
 *                   description: Stripe onboarding URL (UK)
 *                   example: "https://connect.stripe.com/setup/s/1234567890"
 *       400:
 *         description: Invalid request data
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
router.post('/onboard-seller', async (req, res) => {
  try {
    const { userId, fullName, bankCode, accountNumber, country, email, iban, bankName, idNumber } = req.body;
    if (!userId || !country || !fullName) {
      return res.status(400).json({ error: 'Missing userId, country, or fullName' });
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
        return res.status(400).json({ error: `Failed to verify bank account: ${verifyResponse.data.message}` });
      }
      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: fullName,
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
        return res.status(400).json({ error: `Failed to create Paystack recipient: ${recipientResponse.data.message}` });
      }
      const recipientCode = recipientResponse.data.data.recipient_code;
      const sellerRef = doc(db, 'sellers', userId);
      await setDoc(sellerRef, {
        fullName,
        country,
        bankCode,
        accountNumber,
        paystackRecipientCode: recipientCode,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      res.json({ recipientCode });
    } else if (country === 'United Kingdom') {
      if (!iban || !bankName || !email || !idNumber) {
        return res.status(400).json({ error: 'Missing iban, bankName, email, or idNumber for UK' });
      }
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        external_account: {
          object: 'bank_account',
          country: 'GB',
          currency: 'GBP',
          account_number: iban.replace(/[^0-9]/g, ''),
          routing_number: '108800',
        },
      });

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.DOMAIN}/seller-onboarding?status=failed`,
        return_url: `${process.env.DOMAIN}/seller-onboarding?status=success`,
        type: 'account_onboarding',
      });

      const sellerRef = doc(db, 'sellers', userId);
      await setDoc(sellerRef, {
        fullName,
        country,
        idNumber,
        bankName,
        iban,
        email,
        stripeAccountId: account.id,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      res.json({
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Onboarding error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message || 'Unknown error' });
  }
});

/**
 * @swagger
 * /complete-purchase:
 *   post:
 *     summary: Complete a purchase and credit seller
 *     description: Process a purchase and credit the seller's available balance
 *     tags: [Seller Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sellerId
 *               - amount
 *               - productPrice
 *             properties:
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *               amount:
 *                 type: number
 *                 description: Total purchase amount
 *                 example: 11000
 *               productPrice:
 *                 type: number
 *                 description: Original product price
 *                 example: 10000
 *     responses:
 *       200:
 *         description: Purchase completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Purchase completed, seller credited"
 *       400:
 *         description: Invalid request data
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
router.post('/complete-purchase', async (req, res) => {
  try {
    const { sellerId, amount, productPrice } = req.body;
    if (!sellerId || !amount || !productPrice) {
      return res.status(400).json({ error: 'Missing sellerId, amount, or productPrice' });
    }

    const fees = amount - productPrice;
    const sellerEarnings = productPrice;

    const walletRef = doc(db, 'wallets', sellerId);
    await updateDoc(walletRef, {
      availableBalance: firebase.firestore.FieldValue.increment(sellerEarnings),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await addDoc(collection(db, 'transactions'), {
      userId: sellerId,
      type: 'Sale',
      amount: sellerEarnings,
      fees,
      status: 'Completed',
      createdAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Purchase completed, seller credited' });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: 'Failed to complete purchase', details: error.message });
  }
});

/**
 * @swagger
 * /initiate-seller-payout:
 *   post:
 *     summary: Initiate seller payout
 *     description: Initiate a payout request for a seller without altering balance
 *     tags: [Seller Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sellerId
 *               - amount
 *             properties:
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *               amount:
 *                 type: number
 *                 description: Payout amount
 *                 example: 50000
 *     responses:
 *       200:
 *         description: Payout initiated successfully
 * 
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 transactionId:
 *                   type: string
 *                   description: Transaction ID
 *                   example: "transaction123"
 *                 message:
 *                   type: string
 *                   example: "Withdrawal request submitted, awaiting admin approval"
 *       400:
 *         description: Invalid request or insufficient balance
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
router.post('/initiate-seller-payout', async (req, res) => {
  try {
    const { sellerId, amount } = req.body;
    if (!sellerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing sellerId or amount' });
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

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(400).json({ error: 'Seller not found' });
    }
    const seller = sellerSnap.data();
    const transactionReference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const transactionDoc = await addDoc(collection(db, 'transactions'), {
      userId: sellerId,
      type: 'Withdrawal',
      description: `Withdrawal request for ${transactionReference} - Awaiting Admin Approval`,
      amount,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: serverTimestamp(),
      reference: transactionReference,
      country: seller.country,
      paystackRecipientCode: seller.paystackRecipientCode,
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

/**
 * @swagger
 * /approve-payout:
 *   post:
 *     summary: Approve seller payout
 *     description: Approve and process a seller payout request with real-time crediting
 *     tags: [Seller Management]
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
 *                 description: Transaction ID
 *                 example: "transaction123"
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *     responses:
 *       200:
 *         description: Payout approved and processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 reference:
 *                   type: string
 *                   description: Transfer reference (Nigeria)
 *                   example: "TRF_1234567890"
 *                 transferId:
 *                   type: string
 *                   description: Stripe transfer ID (UK)
 *                   example: "tr_1234567890"
 *                 message:
 *                   type: string
 *                   example: "Payout processed and credited to seller account"
 *       400:
 *         description: Invalid request or transaction not found
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
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists() || transactionSnap.data().status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid or non-pending transaction' });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found' });
    }
    const wallet = walletSnap.data();
    const amount = transactionSnap.data().amount;

    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance for payout' });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists() || !sellerSnap.data().paystackRecipientCode) {
      return res.status(400).json({ error: 'Seller not onboarded' });
    }
    const recipientCode = sellerSnap.data().paystackRecipientCode;

    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: `Withdrawal approval for ${transactionId}`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (transferResponse.data.status) {
      await updateDoc(walletRef, {
        availableBalance: wallet.availableBalance - amount,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await updateDoc(transactionRef, {
        status: 'Approved',
        updatedAt: serverTimestamp(),
        transferReference: transferResponse.data.data.reference,
      });
      res.json({
        status: 'success',
        reference: transferResponse.data.data.reference,
        message: 'Payout processed and credited to seller account in real-time',
      });
    } else {
      throw new Error(transferResponse.data.message || 'Transfer failed');
    }
  } catch (error) {
    console.error('Payout approval error:', error);
    res.status(500).json({ error: 'Failed to approve payout', details: error.message });
  }
});

/**
 * @swagger
 * /reject-payout:
 *   post:
 *     summary: Reject seller payout
 *     description: Reject a seller payout request
 *     tags: [Seller Management]
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
 *                 description: Transaction ID
 *                 example: "transaction123"
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *     responses:
 *       200:
 *         description: Payout rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Payout rejected"
 *       400:
 *         description: Invalid request or transaction not found
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
router.post('/reject-payout', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists() || transactionSnap.data().status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid or non-pending transaction' });
    }

    await updateDoc(transactionRef, {
      status: 'Rejected',
      updatedAt: serverTimestamp(),
    });

    res.json({
      status: 'success',
      message: 'Payout rejected',
    });
  } catch (error) {
    console.error('Payout rejection error:', error);
    res.status(500).json({ error: 'Failed to reject payout', details: error.message });
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