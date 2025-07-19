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
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful onboarding
 *                   example: true
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
    if (userSnap.data().role === 'Seller' || userSnap.data().isOnboarded) {
      return res.status(400).json({ error: 'User is already a Seller' });
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
      await updateDoc(userRef, {
        role: 'Seller',
        isOnboarded: false,
        updatedAt: new Date().toISOString(),
      });
      return res.json({
        success: true,
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }

    await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });
    await updateDoc(userRef, {
      role: 'Seller',
      isOnboarded: true,
      updatedAt: new Date().toISOString(),
    });

    await addDoc(collection(db, 'notifications'), {
      type: 'seller_onboarded',
      message: `Seller onboarded: ${fullName} (${country})`,
      createdAt: new Date(),
      details: { userId, country, paystackRecipientCode: sellerData.paystackRecipientCode },
    });

    res.json({
      success: true,
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
    await setDoc(walletRef, {
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
    const { sellerId, amount } = req.body;
    if (!sellerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing sellerId or invalid amount' });
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
 *         description: Payout initiated, OTP sent to admin or completed
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
    const { amount, country, paystackRecipientCode } = transactionData;

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
    if (walletData.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance for payout' });
    }

    if (country === 'Nigeria') {
      const recipientCode = paystackRecipientCode || sellerData.paystackRecipientCode;
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
          timeout: 15000,
        }
      );

      console.log('Approve payout Paystack response:', JSON.stringify(response.data, null, 2)); // Debug log

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
      } else if (response.data.status && response.data.data.status === 'success') {
        await updateDoc(walletRef, {
          availableBalance: walletData.availableBalance - amount,
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
        res.json({
          status: 'success',
          message: 'Payout processed and credited to seller account',
          transferCode: response.data.data.reference,
        });
      } else {
        throw new Error(response.data.message || 'Transfer initiation failed');
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
        availableBalance: walletData.availableBalance - amount,
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
 *     description: Verifies OTP for Nigeria payout and credits seller's bank account in real-time
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
    console.log('Request body:', { transactionId, otp }); // Debug log: Verify input

    if (!transactionId || !otp) {
      return res.status(400).json({ error: 'Missing transactionId or OTP' });
    }

    // Fetch transaction
    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      console.log('Transaction not found:', transactionId); // Debug log
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transactionData = transactionSnap.data();
    console.log('Transaction data:', transactionData); // Debug log: Check transaction fields

    const { transferCode, sellerId, amount } = transactionData; // Use sellerId
    if (!transferCode || !sellerId || !amount) {
      console.log('Missing transaction fields:', { transferCode, sellerId, amount }); // Debug log
      return res.status(400).json({
        error: 'Missing required transaction fields',
        details: { transferCode, sellerId, amount },
      });
    }

    // Fetch wallet
    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      console.log('Wallet not found:', sellerId); // Debug log
      return res.status(404).json({ error: 'Seller wallet not found' });
    }
    const walletData = walletSnap.data();
    console.log('Wallet data:', walletData); // Debug log: Check wallet fields
    if (typeof walletData.availableBalance !== 'number' || walletData.availableBalance < amount) {
      console.log('Invalid wallet balance:', { availableBalance: walletData.availableBalance, amount }); // Debug log
      return res.status(400).json({ error: 'Insufficient available balance for payout' });
    }

    // Call Paystack
    console.log('Calling Paystack with:', { transfer_code: transferCode, otp }); // Debug log: Before API call
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

    console.log('Paystack response:', JSON.stringify(response.data, null, 2)); // Debug log: Full response

    if (!response.data || !response.data.data || typeof response.data.status !== 'boolean') {
      console.log('Invalid Paystack response structure:', response.data); // Debug log
      throw new Error('Invalid Paystack response structure');
    }

    if (response.data.status && response.data.data.status === 'success') {
      await updateDoc(walletRef, {
        availableBalance: walletData.availableBalance - amount,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(transactionRef, {
        status: 'Approved',
        transferReference: response.data.data.reference || 'N/A',
        completedAt: serverTimestamp(),
      });
      const sellerRef = doc(db, 'sellers', sellerId);
      const sellerSnap = await getDoc(sellerRef);
      console.log('Seller data:', sellerSnap.exists() ? sellerSnap.data() : 'Not found'); // Debug log
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
      console.log('Paystack failure:', response.data.message || 'No message provided'); // Debug log
      throw new Error(response.data.message || 'OTP verification failed');
    }
  } catch (error) {
    console.error('Verify OTP error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data ? JSON.stringify(error.response.data, null, 2) : 'No response data',
    }); // Detailed error log
    const errorMessage = error.response?.data?.message || error.message;
    if (errorMessage.includes('OTP has expired') || errorMessage.includes('OTP could not be verified')) {
      res.status(400).json({
        error: 'Invalid or expired OTP',
        details: 'Please click "Resend OTP" to receive a new OTP.',
      });
    } else {
      res.status(500).json({
        error: 'Failed to verify OTP',
        details: errorMessage,
      });
    }
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
    const { amount, country, status, paystackRecipientCode } = transactionSnap.data();
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
    const recipientCode = paystackRecipientCode || sellerSnap.data().paystackRecipientCode;
    if (!recipientCode) {
      return res.status(400).json({ error: 'Seller has not completed Paystack onboarding' });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found' });
    }
    if (walletSnap.data().availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance for payout' });
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

    console.log('Resend OTP Paystack response:', JSON.stringify(response.data, null, 2)); // Debug log

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
      throw new Error(response.data.message || 'Failed to resend OTP');
    }
  } catch (error) {
    console.error('Resend OTP error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to resend OTP', details: error.response?.data?.message || error.message });
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
    if (!transactionSnap.exists() || !['Pending', 'pending_otp'].includes(transactionSnap.data().status)) {
      return res.status(400).json({ error: 'Invalid or non-pending transaction' });
    }

    await updateDoc(transactionRef, {
      status: 'Rejected',
      updatedAt: serverTimestamp(),
    });

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists() && sellerSnap.data().email) {
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_rejected',
        message: `Payout request of ₦${transactionSnap.data().amount.toFixed(2)} for transaction ${transactionId} rejected`,
        createdAt: new Date(),
        details: { transactionId, sellerId, email: sellerSnap.data().email },
      });
    }

    res.json({
      status: 'success',
      message: 'Payout rejected',
    });
  } catch (error) {
    console.error('Payout rejection error:', error);
    res.status(500).json({ error: 'Failed to reject payout', details: error.message });
  }
});

/**
 * @swagger
 * /paystack-webhook:
 *   post:
 *     summary: Handle Paystack webhook events
 *     description: Process Paystack webhook events for transfer updates
 *     tags: [Seller Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 description: Webhook event type
 *                 example: "transfer.success"
 *               data:
 *                 type: object
 *                 description: Event data
 *                 example:
 *                   reference: "TRF_1234567890"
 *                   metadata:
 *                     transactionId: "transaction123"
 *                   status: "success"
 *                   reason: "Transfer completed"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
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
 *                   example: "Webhook received"
 *       400:
 *         description: Invalid webhook signature
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

    console.log('Received Paystack webhook:', event);

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
        const walletRef = doc(db, 'wallets', sellerId);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          await updateDoc(walletRef, {
            availableBalance: walletSnap.data().availableBalance - amount,
            updatedAt: serverTimestamp(),
          });
        }
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
        console.log(`Transfer ${event.data.reference} succeeded for transaction ${event.data.metadata.transactionId}`);
      }
    } else if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        await updateDoc(transactionRef, {
          status: 'Failed',
          updatedAt: serverTimestamp(),
          transferReference: event.data.reference,
          failureReason: error.data.reason,
        });
        console.log(`Transfer ${event.data.reference} failed for transaction ${event.data.metadata.transactionId}: ${event.data.reason}`);
      }
    }

    res.status(200).json({ status: 'success', message: 'Webhook received' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

module.exports = router;