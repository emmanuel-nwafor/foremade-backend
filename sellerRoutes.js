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

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userSnap.data().role !== 'Buyer') {
      return res.status(400).json({ error: 'User is already a Seller or Admin' });
    }

    const sellerData = {
      fullName,
      country,
      idNumber: country === 'United Kingdom' ? idNumber : '',
      bankName: '',
      bankCode: country === 'Nigeria' ? bankCode : '',
      accountNumber: country === 'Nigeria' ? accountNumber : '',
      iban: country === 'United Kingdom' ? iban : '',
      email: country === 'United Kingdom' ? email : userSnap.data().email,
      paystackRecipientCode: '',
      stripeAccountId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (country === 'Nigeria') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Bank code and account number required for Nigeria' });
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
      sellerData.paystackRecipientCode = recipientResponse.data.data.recipient_code;
      try {
        const bankResponse = await axios.get('https://api.paystack.co/bank', {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const bank = bankResponse.data.data.find(b => b.code === bankCode);
        sellerData.bankName = bank ? bank.name : 'Unknown Bank';
      } catch (bankError) {
        console.warn('Failed to fetch bank name:', bankError.message);
        sellerData.bankName = 'Unknown Bank';
      }
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
      });
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.DOMAIN}/seller-onboarding?status=failed`,
        return_url: `${process.env.DOMAIN}/seller-onboarding?status=success`,
        type: 'account_onboarding',
      });
      sellerData.stripeAccountId = account.id;
      sellerData.bankName = bankName;
      await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });
      await updateDoc(userRef, { role: 'Seller', updatedAt: new Date().toISOString() });
      return res.json({
        message: 'Seller onboarding initiated, complete via Stripe',
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }

    await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });
    await updateDoc(userRef, { role: 'Seller', updatedAt: new Date().toISOString() });

    await addDoc(collection(db, 'notifications'), {
      type: 'seller_onboarded',
      message: `Seller onboarded: ${fullName} (${country})`,
      createdAt: new Date(),
      details: { userId, country, paystackRecipientCode: sellerData.paystackRecipientCode },
    });

    res.json({
      message: 'Seller onboarding successful',
      recipientCode: sellerData.paystackRecipientCode || undefined,
      stripeAccountId: sellerData.stripeAccountId || undefined,
    });
  } catch (error) {
    console.error('Onboarding error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message });
  }
});

/**
 * @swagger
 * /initiate-seller-payout:
 *   post:
 *     summary: Initiate seller payout
 *     description: Create a pending payout request for Nigeria (Paystack) or UK (Stripe)
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
 *               - transactionReference
 *               - accountDetails
 *             properties:
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *               amount:
 *                 type: number
 *                 description: Payout amount
 *                 example: 50000
 *               transactionReference:
 *                 type: string
 *                 description: Unique transaction reference
 *                 example: "TXN_1234567890"
 *               accountDetails:
 *                 type: object
 *                 description: Seller's bank details
 *                 properties:
 *                   accountNumber:
 *                     type: string
 *                     example: "0123456789"
 *                   bankName:
 *                     type: string
 *                     example: "GTBank"
 *                   accountName:
 *                     type: string
 *                     example: "John Doe"
 *     responses:
 *       200:
 *         description: Payout request created
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
    const { sellerId, amount, transactionReference, accountDetails } = req.body;
    if (!sellerId || !amount || amount <= 0 || !transactionReference || !accountDetails) {
      return res.status(400).json({ error: 'Missing sellerId, amount, transactionReference, or accountDetails' });
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

    await updateDoc(walletRef, {
      availableBalance: wallet.availableBalance - amount,
      pendingBalance: (wallet.pendingBalance || 0) + amount,
      updatedAt: serverTimestamp(),
    });

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
      accountDetails,
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
 *     description: Initiate Paystack transfer with OTP for Nigeria or Stripe transfer for UK
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
 *         description: Payout initiated, OTP sent to admin
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
 *                   example: "OTP sent to admin email for transaction"
 *                 transferCode:
 *                   type: string
 *                   description: Paystack transfer code (Nigeria)
 *                   example: "TRF_1234567890"
 *                 transferId:
 *                   type: string
 *                   description: Stripe transfer ID (UK)
 *                   example: "tr_1234567890"
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
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transactionData = transactionSnap.data();
    if (transactionData.status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid transaction status' });
    }
    const { amount, country } = transactionData;

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    const sellerData = sellerSnap.data();

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found' });
    }
    const walletData = walletSnap.data();
    if ((walletData.pendingBalance || 0) < amount) {
      return res.status(400).json({ error: 'Insufficient pending balance for payout' });
    }

    if (country === 'Nigeria') {
      const recipientCode = sellerData.paystackRecipientCode;
      if (!recipientCode) {
        return res.status(400).json({ error: 'Seller has not completed Paystack onboarding' });
      }

      const balanceResponse = await axios.get('https://api.paystack.co/balance', {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const availableBalance = balanceResponse.data.data[0].balance / 100;
      if (availableBalance < amount) {
        return res.status(400).json({ error: 'Insufficient Paystack balance for transfer' });
      }

      const response = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: `Payout for transaction ${transactionId}`,
          currency: 'NGN',
          metadata: { transactionId },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.status && response.data.data.status === 'otp') {
        await updateDoc(transactionRef, {
          status: 'pending_otp',
          transferCode: response.data.data.transfer_code,
          updatedAt: serverTimestamp(),
        });
        const adminRef = doc(db, 'admin', 'settings');
        const adminSnap = await getDoc(adminRef);
        const adminEmail = adminSnap.exists() ? adminSnap.data().email : 'emitexc.e.o1@gmail.com';
        await addDoc(collection(db, 'notifications'), {
          type: 'payout_otp',
          message: `OTP sent for payout approval of ₦${amount.toFixed(2)} for transaction ${transactionId}`,
          createdAt: new Date(),
          details: { transactionId, sellerId, adminEmail },
        });
        res.status(200).json({
          status: 'success',
          message: `OTP sent to admin email for transaction ${transactionId}`,
          transferCode: response.data.data.transfer_code,
        });
      } else {
        throw new Error('Transfer initiation failed');
      }
    } else if (country === 'United Kingdom') {
      const stripeAccountId = sellerData.stripeAccountId;
      if (!stripeAccountId) {
        return res.status(400).json({ error: 'Seller has not completed Stripe onboarding' });
      }
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        destination: stripeAccountId,
        transfer_group: transactionId,
      });
      await updateDoc(walletRef, {
        pendingBalance: (walletData.pendingBalance || 0) - amount,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(transactionRef, {
        status: 'Approved',
        transferId: transfer.id,
        updatedAt: serverTimestamp(),
      });
      res.json({
        status: 'success',
        message: 'Payout processed for UK seller',
        transferId: transfer.id,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Payout approval error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to approve payout', details: error.response?.data?.message || error.message });
  }
});

/**
 * @swagger
 * /verify-transfer-otp:
 *   post:
 *     summary: Verify OTP to finalize Paystack payout
 *     description: Verifies OTP for Nigeria payout and credits seller's bank account
 *     tags: [Seller Management]
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
 *                 description: Transaction ID
 *                 example: "transaction123"
 *               otp:
 *                 type: string
 *                 description: OTP received by admin
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Payout finalized successfully
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
 *                   example: "Payout completed successfully"
 *       400:
 *         description: Invalid request or OTP
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
  try {
    const { transactionId, otp } = req.body;
    if (!transactionId || !otp) {
      return res.status(400).json({ error: 'Missing transactionId or OTP' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const { transferCode, sellerId, amount } = transactionSnap.data();
    if (!transferCode) {
      return res.status(400).json({ error: 'No transfer code found' });
    }

    const response = await axios.post(
      'https://api.paystack.co/transfer/finalize_transfer',
      {
        transfer_code: transferCode,
        otp,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status && response.data.data.status === 'success') {
      const walletRef = doc(db, 'wallets', sellerId);
      const walletSnap = await getDoc(walletRef);
      if (!walletSnap.exists()) {
        throw new Error('Seller wallet not found');
      }
      await updateDoc(walletRef, {
        pendingBalance: (walletSnap.data().pendingBalance || 0) - amount,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(transactionRef, {
        status: 'Approved',
        completedAt: serverTimestamp(),
      });
      const sellerRef = doc(db, 'sellers', sellerId);
      const sellerSnap = await getDoc(sellerRef);
      if (sellerSnap.exists() && sellerSnap.data().email) {
        await addDoc(collection(db, 'notifications'), {
          type: 'payout_completed',
          message: `Payout of ₦${amount.toFixed(2)} for transaction ${transactionId} completed`,
          createdAt: new Date(),
          details: { transactionId, sellerId, email: sellerSnap.data().email },
        });
      }
      res.status(200).json({ status: 'success', message: 'Payout completed successfully' });
    } else {
      throw new Error('OTP verification failed');
    }
  } catch (error) {
    console.error('Verify OTP error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to verify OTP', details: error.response?.data?.message || error.message });
  }
});

/**
 * @swagger
 * /resend-otp:
 *   post:
 *     summary: Resend OTP for Paystack payout
 *     description: Resend OTP for a pending Paystack payout transaction
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
 *         description: OTP resent successfully
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
 *                   example: "New OTP sent to admin email"
 *                 transferCode:
 *                   type: string
 *                   description: New Paystack transfer code
 *                   example: "TRF_1234567890"
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
router.post('/resend-otp', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const { amount, country, status } = transactionSnap.data();
    if (status !== 'pending_otp') {
      return res.status(400).json({ error: 'Transaction not in pending_otp status' });
    }
    if (country !== 'Nigeria') {
      return res.status(400).json({ error: 'Resend OTP only supported for Nigeria' });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    const sellerData = sellerSnap.data();
    const recipientCode = sellerData.paystackRecipientCode;
    if (!recipientCode) {
      return res.status(400).json({ error: 'Seller has not completed Paystack onboarding' });
    }

    const balanceResponse = await axios.get('https://api.paystack.co/balance', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const availableBalance = balanceResponse.data.data[0].balance / 100;
    if (availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient Paystack balance for transfer' });
    }

    const response = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: `Payout for transaction ${transactionId} (Resend OTP)`,
        currency: 'NGN',
        metadata: { transactionId },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status && response.data.data.status === 'otp') {
      await updateDoc(transactionRef, {
        transferCode: response.data.data.transfer_code,
        updatedAt: serverTimestamp(),
      });
      const adminRef = doc(db, 'admin', 'settings');
      const adminSnap = await getDoc(adminRef);
      const adminEmail = adminSnap.exists() ? adminSnap.data().email : 'emitexc.e.o1@gmail.com';
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_otp',
        message: `New OTP sent for payout approval of ₦${amount.toFixed(2)} for transaction ${transactionId}`,
        createdAt: new Date(),
        details: { transactionId, sellerId, adminEmail },
      });
      res.status(200).json({
        status: 'success',
        message: 'New OTP sent to admin email',
        transferCode: response.data.data.transfer_code,
      });
    } else {
      throw new Error('Failed to resend OTP');
    }
  } catch (error) {
    console.error('Resend OTP error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to resend OTP', details: error.response?.data?.message || error.message });
  }
});

module.exports = router;