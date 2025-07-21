const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection, increment } = require('firebase/firestore');
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
      return res.status(400).json({ error: 'Missing userId, country, or fullName', details: { userId, country, fullName } });
    }

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found', details: { userId } });
    }
    if (userSnap.data().role === 'Seller' || userSnap.data().isOnboarded) {
      return res.status(400).json({ error: 'User is already a Seller', details: { userId } });
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
        return res.status(400).json({ error: 'Bank code and account number required for Nigeria', details: { bankCode, accountNumber } });
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
        return res.status(400).json({ error: `Failed to verify bank account: ${verifyResponse.data.message}`, details: { accountNumber, bankCode } });
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
        return res.status(400).json({ error: `Failed to create Paystack recipient: ${recipientResponse.data.message}`, details: { accountNumber, bankCode } });
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
        return res.status(400).json({ error: 'Missing iban, bankName, email, or idNumber for UK', details: { iban, bankName, email, idNumber } });
      }
      // Create Stripe account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        // Optionally add external_account if you want to attach bank details immediately
        // external_account: {
        //   object: 'bank_account',
        //   country: 'GB',
        //   currency: 'GBP',
        //   account_number: iban.replace(/[^0-9]/g, ''),
        //   routing_number: '108800',
        // },
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
      return res.status(400).json({ error: 'Unsupported country', details: { country } });
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
        const bank = bankResponse.data.data.find(b => b.code === bankCode);
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
    console.error('Onboarding error:', error.message, { userId: req.body.userId, country: req.body.country });
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message });
  }
});

/**
 * @swagger
 * /initiate-seller-payout:
 *   post:
 *     summary: Initiate seller payout
 *     description: Initiate a payout request for a seller
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
 *               bankCode:
 *                 type: string
 *                 description: Bank code (for Nigeria)
 *                 example: "044"
 *               accountNumber:
 *                 type: string
 *                 description: Account number (for Nigeria)
 *                 example: "0123456789"
 *               country:
 *                 type: string
 *                 enum: [Nigeria, United Kingdom]
 *                 description: Seller's country
 *                 example: "Nigeria"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address (for UK)
 *                 example: "seller@example.com"
 *     responses:
 *       200:
 *         description: Payout initiated successfully
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
    console.log('Approve payout request:', { transactionId, sellerId }); // Debug log
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId', details: { transactionId, sellerId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }
    const transactionData = transactionSnap.data();
    if (transactionData.sellerId !== sellerId) {
      return res.status(400).json({ error: 'Seller ID does not match transaction', details: { transactionId, sellerId, transactionSellerId: transactionData.sellerId } });
    }
    if (transactionData.status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid transaction status', details: { transactionId, status: transactionData.status } });
    }
    const { amount, country, paystackRecipientCode } = transactionData;

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found', details: { sellerId } });
    }
    const sellerData = sellerSnap.data();

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found', details: { sellerId } });
    }
    const walletData = walletSnap.data();
    if (walletData.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance for payout', details: { availableBalance: walletData.availableBalance, amount } });
    }

    if (country === 'Nigeria') {
      const recipientCode = paystackRecipientCode || sellerData.paystackRecipientCode;
      if (!recipientCode) {
        return res.status(400).json({ error: 'Seller has not completed Paystack onboarding', details: { sellerId, paystackRecipientCode } });
      }

      const balanceResponse = await axios.get('https://api.paystack.co/balance', {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const availableBalance = balanceResponse.data.data[0].balance / 100;
      if (availableBalance < amount) {
        return res.status(400).json({ error: 'Insufficient Paystack balance for transfer', details: { availableBalance, amount } });
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
          timeout: 15000,
        }
      );

      if (response.data.status && ['success', 'pending'].includes(response.data.data.status)) {
        await updateDoc(walletRef, {
          availableBalance: increment(-amount),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(transactionRef, {
          status: 'Approved',
          transferReference: response.data.data.reference,
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'notifications'), {
          type: 'payout_completed',
          message: `Payout of ₦${amount.toFixed(2)} for transaction ${transactionId} completed`,
          createdAt: new Date(),
          details: { transactionId, sellerId, email: sellerData.email },
        });
        return res.json({
          status: 'success',
          message: 'Payout processed and credited to seller account',
          transferReference: response.data.data.reference,
        });
      } else {
        throw new Error(response.data.message || 'Transfer initiation failed');
      }
    } else if (country === 'United Kingdom') {
      const stripeAccountId = sellerData.stripeAccountId;
      if (!stripeAccountId) {
        return res.status(400).json({ error: 'Seller has not completed Stripe onboarding', details: { sellerId, stripeAccountId } });
      }
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        destination: stripeAccountId,
        transfer_group: transactionId,
      });
      await updateDoc(walletRef, {
        availableBalance: increment(-amount),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(transactionRef, {
        status: 'Approved',
        transferId: transfer.id,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_completed',
        message: `Payout of £${amount.toFixed(2)} for transaction ${transactionId} completed`,
        createdAt: new Date(),
        details: { transactionId, sellerId, email: sellerData.email },
      });
      return res.json({
        status: 'success',
        message: 'Payout processed for UK seller',
        transferId: transfer.id,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country', details: { country } });
    }
  } catch (error) {
    console.error('Payout approval error:', error.message, { transactionId: req.body.transactionId, sellerId: req.body.sellerId });
    return res.status(500).json({ error: 'Failed to approve payout', details: error.message });
  }
});

/**
 * @swagger
 * /reject-payout:
 *   post:
 *     summary: Reject seller payout
 *     description: Reject a seller payout request and return funds to available balance
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
    console.log('Reject payout request:', { transactionId, sellerId }); // Debug log
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId', details: { transactionId, sellerId } });
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
    console.error('Payout rejection error:', error.message, { transactionId: req.body.transactionId, sellerId: req.body.sellerId });
    return res.status(500).json({ error: 'Failed to reject payout', details: error.message });
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
      return res.status(400).json({ error: 'Missing sellerId, amount, or productPrice', details: { sellerId, amount, productPrice } });
    }

    const fees = amount - productPrice;
    const sellerEarnings = productPrice;

    const walletRef = doc(db, 'wallets', sellerId);
    await setDoc(walletRef, {
      availableBalance: increment(sellerEarnings),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await addDoc(collection(db, 'transactions'), {
      sellerId,
      type: 'Sale',
      amount: sellerEarnings,
      fees,
      status: 'Completed',
      createdAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Purchase completed, seller credited' });
  } catch (error) {
    console.error('Purchase error:', error.message, { sellerId: req.body.sellerId });
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
    const { sellerId, amount, accountDetails } = req.body;
    if (!sellerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing sellerId or invalid amount', details: { sellerId, amount } });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found', details: { sellerId } });
    }
    const wallet = walletSnap.data();

    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance', details: { availableBalance: wallet.availableBalance, amount } });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(400).json({ error: 'Seller not found', details: { sellerId } });
    }
    const seller = sellerSnap.data();

    const transactionReference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transactionDoc = await addDoc(collection(db, 'transactions'), {
      sellerId,
      type: 'Withdrawal',
      description: `Withdrawal request for ${transactionReference} - Awaiting Admin Approval`,
      amount,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: serverTimestamp(),
      reference: transactionReference,
      country: seller.country,
      paystackRecipientCode: seller.paystackRecipientCode,
      bankName: accountDetails?.bankName || seller.bankName || 'N/A',
      accountNumber: accountDetails?.accountNumber || seller.accountNumber || 'N/A',
    });

    await addDoc(collection(db, 'notifications'), {
      type: 'payout_request',
      message: `New payout request of ₦${amount.toFixed(2)} from seller ${sellerId}`,
      createdAt: new Date(),
      details: { transactionId: transactionDoc.id, sellerId },
    });

    res.json({
      status: 'success',
      transactionId: transactionDoc.id,
      message: 'Withdrawal request submitted, awaiting admin approval',
    });
  } catch (error) {
    console.error('Payout initiation error:', error.message, { sellerId: req.body.sellerId, amount: req.body.amount });
    res.status(500).json({ error: 'Failed to initiate seller payout', details: error.message });
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
    console.log('Reject payout request:', { transactionId, sellerId }); // Debug log
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId', details: { transactionId, sellerId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }
    if (transactionSnap.data().sellerId !== sellerId) {
      return res.status(400).json({ error: 'Seller ID does not match transaction', details: { transactionId, sellerId, transactionSellerId: transactionSnap.data().sellerId } });
    }
    if (transactionSnap.data().status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid or non-pending transaction', details: { transactionId, status: transactionSnap.data().status } });
    }
    const { amount } = transactionSnap.data();

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found', details: { sellerId } });
    }

    await updateDoc(transactionRef, {
      status: 'Rejected',
      updatedAt: serverTimestamp(),
    });

    await updateDoc(walletRef, {
      availableBalance: increment(amount),
      updatedAt: serverTimestamp(),
    });

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists() && sellerSnap.data().email) {
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_rejected',
        message: `Payout request of ₦${amount.toFixed(2)} for transaction ${transactionId} rejected and refunded to wallet`,
        createdAt: new Date(),
        details: { transactionId, sellerId, email: sellerSnap.data().email },
      });
    }

    return res.json({
      status: 'success',
      message: 'Payout rejected and amount refunded to seller wallet',
    });
  } catch (error) {
    console.error('Payout rejection error:', error.message, { transactionId: req.body.transactionId, sellerId: req.body.sellerId });
    return res.status(500).json({ error: 'Failed to reject payout', details: error.message });
  }
});

async function createRecipient(bankCode, accountNumber, name) {
  try {
    const recipient = await stripe.recipients.create({
      type: 'corporate',
      bank_account: {
        country: 'GB',
        currency: 'gbp',
        account_holder_name: name,
        account_number: accountNumber,
        sort_code: bankCode,
      },
      email: 'info@example.com', // Replace with a valid email
      description: `Payout for transaction ${accountNumber}`,
    });
    return { recipient_code: recipient.id };
  } catch (error) {
    console.error('Failed to create Paystack recipient:', error);
    return { error: error.message };
  }
}

async function pollTransferStatus(reference, transactionId, maxAttempts = 5, interval = 30000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const verifyResponse = await axios.get(
        `https://api.paystack.co/transfer/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (verifyResponse.data.data.status === 'success') {
        const transactionRef = doc(db, 'transactions', transactionId);
        await updateDoc(transactionRef, {
          status: 'Approved',
          updatedAt: serverTimestamp(),
        });
        return true;
      } else if (verifyResponse.data.data.status === 'failed') {
        const transactionRef = doc(db, 'transactions', transactionId);
        await updateDoc(transactionRef, {
          status: 'Failed',
          updatedAt: serverTimestamp(),
          failureReason: verifyResponse.data.data.gateway_response,
        });
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.error('Polling error:', error);
    }
  }
  return false;
}

router.post('/paystack-webhook', async (req, res) => {
  try {
    const event = req.body;
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha512', secret);
    const expectedSignature = hmac.update(JSON.stringify(event)).digest('hex');
    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature:', { received: signature, expected: expectedSignature });
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    if (event.event === 'transfer.success') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        const { sellerId, amount } = transactionSnap.data();
        await updateDoc(transactionRef, {
          status: 'Approved',
          transferReference: event.data.reference,
          updatedAt: serverTimestamp(),
        });
        const sellerRef = doc(db, 'sellers', sellerId);
        const sellerSnap = await getDoc(sellerRef);
        if (sellerSnap.exists() && sellerSnap.data().email) {
          await addDoc(collection(db, 'notifications'), {
            type: 'payout_completed',
            message: `Payout of ₦${amount.toFixed(2)} for transaction ${event.data.metadata.transactionId} completed`,
            createdAt: new Date(),
            details: { transactionId: event.data.metadata.transactionId, sellerId, email: sellerSnap.data().email },
          });
        }
      }
    } else if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        const { sellerId, amount } = transactionSnap.data();
        await updateDoc(transactionRef, {
          status: 'Failed',
          updatedAt: serverTimestamp(),
          transferReference: event.data.reference,
          failureReason: event.data.reason || 'Unknown reason',
        });
        const walletRef = doc(db, 'wallets', sellerId);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          await updateDoc(walletRef, {
            availableBalance: increment(amount),
            updatedAt: serverTimestamp(),
          });
        }
        const sellerRef = doc(db, 'sellers', sellerId);
        const sellerSnap = await getDoc(sellerRef);
        if (sellerSnap.exists() && sellerSnap.data().email) {
          await addDoc(collection(db, 'notifications'), {
            type: 'payout_failed',
            message: `Payout of ₦${amount.toFixed(2)} for transaction ${event.data.metadata.transactionId} failed and refunded to wallet`,
            createdAt: new Date(),
            details: { transactionId: event.data.metadata.transactionId, sellerId, email: sellerSnap.data().email },
          });
        }
      }
    }

    return res.status(200).json({ status: 'success', message: 'Webhook received' });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

router.post('/delete-transaction', async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required', details: { transactionId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);

    if (!transactionSnap.exists) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }

    await transactionRef.delete();
    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error.message, { transactionId: req.body.transactionId });
    res.status(500).json({ error: 'Failed to delete transaction', details: error.message });
  }
});

module.exports = router;