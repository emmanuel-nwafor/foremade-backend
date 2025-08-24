const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection, deleteDoc, increment } = require('firebase/firestore');
const { authenticateFirebaseToken } = require('./middleware');
const router = express.Router();

/**
 * @swagger
 * /onboard-seller:
 *   post:
 *     summary: Onboard seller (standard or pro)
 *     description: Onboards a standard or Pro Seller with banking details verification
 *     tags: [Sellers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - fullName
 *               - country
 *             properties:
 *               userId:
 *                 type: string
 *               fullName:
 *                 type: string
 *               country:
 *                 type: string
 *               bankCode:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               iban:
 *                 type: string
 *               bankName:
 *                 type: string
 *               email:
 *                 type: string
 *               idNumber:
 *                 type: string
 *               proSeller:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Seller onboarded successfully
 *       400:
 *         description: Invalid request or verification failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       409:
 *         description: User already onboarded
 *       500:
 *         description: Server error
 */
router.post('/onboard-seller', authenticateFirebaseToken, async (req, res) => {
  try {
    const { userId, fullName, bankCode, accountNumber, country, email, iban, bankName, idNumber, proSeller = false } = req.body;

    if (!userId || !country || !fullName) {
      return res.status(400).json({ error: 'Missing userId, country, or fullName', details: { userId, country, fullName } });
    }

    const normalizedCountry = country === 'United Kingdom' || country === 'UK' ? 'GB' : country === 'Nigeria' ? 'NG' : country;

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found', details: { userId } });
    }
    if (userSnap.data().isOnboarded) {
      return res.status(409).json({ error: 'User is already onboarded', details: { userId } });
    }

    const sellerData = {
      fullName,
      country: normalizedCountry,
      idNumber: normalizedCountry === 'GB' ? idNumber : '',
      bankName: '',
      bankCode: normalizedCountry === 'NG' ? bankCode : '',
      accountNumber: normalizedCountry === 'NG' ? accountNumber : '',
      iban: normalizedCountry === 'GB' ? iban : '',
      email: normalizedCountry === 'GB' ? email : userSnap.data().email,
      paystackRecipientCode: '',
      stripeAccountId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    let verifiedBankName = bankName;

    if (normalizedCountry === 'NG') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Bank code and account number required for Nigeria', details: { bankCode, accountNumber } });
      }
      const verifyResponse = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );
      if (!verifyResponse.data.status || verifyResponse.data.data.account_name !== fullName) {
        return res.status(400).json({ error: 'Failed to verify bank account', details: { accountNumber, bankCode } });
      }
      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        { type: 'nuban', name: fullName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );
      if (!recipientResponse.data.status) {
        return res.status(400).json({ error: `Failed to create Paystack recipient: ${recipientResponse.data.message}` });
      }
      sellerData.paystackRecipientCode = recipientResponse.data.data.recipient_code;
      const bankResponse = await axios.get('https://api.paystack.co/bank', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      const bank = bankResponse.data.data.find(b => b.code === bankCode);
      verifiedBankName = bank ? bank.name : 'Unknown Bank';
      sellerData.bankName = verifiedBankName;
    } else if (normalizedCountry === 'GB') {
      if (!iban || !bankName || !email || !idNumber) {
        return res.status(400).json({ error: 'Missing iban, bankName, email, or idNumber for UK', details: { iban, bankName, email, idNumber } });
      }
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.DOMAIN}/seller-onboarding?status=failed`,
        return_url: `${process.env.DOMAIN}/seller-onboarding?status=success`,
        type: 'account_onboarding',
      });
      sellerData.stripeAccountId = account.id;
      sellerData.bankName = bankName;
      sellerData.email = email;
      await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });
      await updateDoc(userRef, {
        role: 'Seller',
        isOnboarded: proSeller ? true : false,
        proStatus: proSeller ? 'pending' : undefined,
        updatedAt: serverTimestamp(),
      });
      return res.json({
        success: true,
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country', details: { country: normalizedCountry } });
    }

    await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });

    // Initialize or update wallet
    await setDoc(doc(db, 'wallets', userId), {
      availableBalance: 0,
      pendingWithdrawals: 0,
      totalEarnings: 0,
      updatedAt: serverTimestamp(),
      accountDetails: {
        bankName: verifiedBankName,
        bankCode: normalizedCountry === 'NG' ? bankCode : '',
        accountNumber: normalizedCountry === 'NG' ? accountNumber : '',
        accountName: fullName,
        iban: normalizedCountry === 'GB' ? iban : '',
      },
    }, { merge: true });

    await updateDoc(userRef, {
      role: 'Seller',
      isOnboarded: true,
      proStatus: proSeller ? 'pending' : undefined,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      type: proSeller ? 'pro_seller_onboarded' : 'seller_onboarded',
      message: `${proSeller ? 'Pro Seller' : 'Seller'} onboarded: ${fullName} (${normalizedCountry})`,
      createdAt: serverTimestamp(),
      details: { userId, country: normalizedCountry, paystackRecipientCode: sellerData.paystackRecipientCode },
    });

    res.json({
      success: true,
      recipientCode: sellerData.paystackRecipientCode || undefined,
      stripeAccountId: sellerData.stripeAccountId || undefined,
      bankName: verifiedBankName,
      message: proSeller ? 'Banking details onboarded for Pro Seller, pending approval' : 'Seller onboarded successfully',
    });
  } catch (error) {
    console.error('Onboarding error:', error.message, { userId: req.body.userId, country: req.body.country });
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message });
  }
});

/**
 * @swagger
 * /api/pro-seller/wallet:
 *   get:
 *     summary: Get seller wallet
 *     description: Retrieve wallet information for the authenticated seller
 *     tags: [Sellers]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet retrieved successfully
 *       400:
 *         description: User not a seller
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wallet or seller data not found
 *       500:
 *         description: Server error
 */
router.get('/api/pro-seller/wallet', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || !userSnap.data().role.includes('Seller')) {
      return res.status(400).json({ error: 'User is not a seller' });
    }

    const userData = userSnap.data();
    const isProSeller = userData.proStatus === 'approved';
    const proStatus = userData.proStatus || '';

    const walletRef = doc(db, 'wallets', uid);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const walletData = walletSnap.data();

    const sellerRef = doc(db, 'sellers', uid);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller data not found' });
    }

    const sellerData = sellerSnap.data();
    const bankingDetails = {
      bankName: sellerData.bankName || '',
      bankCode: sellerData.bankCode || '',
      accountNumber: sellerData.accountNumber || '',
      accountName: sellerData.accountName || sellerData.fullName || '',
      iban: sellerData.iban || '',
      paystackRecipientCode: sellerData.paystackRecipientCode || '',
      stripeAccountId: sellerData.stripeAccountId || '',
    };

    res.status(200).json({
      status: 'success',
      wallet: {
        availableBalance: walletData.availableBalance || 0,
        pendingWithdrawals: walletData.pendingWithdrawals || 0,
        totalEarnings: walletData.totalEarnings || 0,
        updatedAt: walletData.updatedAt?.toDate?.() || new Date(),
        bankingDetails,
        sellerType: isProSeller ? 'Pro Seller' : 'Standard Seller',
        proStatus,
      },
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet', details: error.message });
  }
});

/**
 * @swagger
 * /initiate-seller-payout:
 *   post:
 *     summary: Initiate seller payout
 *     description: Initiate a payout request for the authenticated seller
 *     tags: [Sellers]
 *     security:
 *       - BearerAuth: []
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
 *               amount:
 *                 type: number
 *               transactionReference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payout initiated successfully
 *       400:
 *         description: Invalid request or insufficient balance
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wallet or banking details not found
 *       500:
 *         description: Server error
 */
router.post('/initiate-seller-payout', authenticateFirebaseToken, async (req, res) => {
  try {
    const { sellerId, amount, transactionReference } = req.body;

    if (!sellerId || !amount || amount <= 0 || !transactionReference) {
      return res.status(400).json({ error: 'Missing sellerId, amount, or transactionReference' });
    }

    const userRef = doc(db, 'users', sellerId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found', details: { sellerId } });
    }
    const userData = userSnap.data();
    if (!userData.isOnboarded) {
      return res.status(400).json({ error: 'Seller not onboarded', details: { sellerId } });
    }
    if (userData.proStatus && userData.proStatus !== 'approved') {
      return res.status(400).json({ error: 'Pro Seller account is not approved', details: { proStatus: userData.proStatus } });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Wallet not found', details: { sellerId } });
    }
    const wallet = walletSnap.data();
    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance', details: { availableBalance: wallet.availableBalance, amount } });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found', details: { sellerId } });
    }
    const seller = sellerSnap.data();

    if (!seller.paystackRecipientCode && !seller.stripeAccountId) {
      return res.status(404).json({ error: 'Banking details not found', details: { sellerId } });
    }

    await updateDoc(walletRef, {
      availableBalance: increment(-amount),
      pendingWithdrawals: increment(amount),
      updatedAt: serverTimestamp(),
    });

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
      paystackRecipientCode: seller.paystackRecipientCode || '',
      stripeAccountId: seller.stripeAccountId || '',
      bankName: seller.bankName || '',
      accountNumber: seller.accountNumber || '',
      email: seller.email || '',
      isProSeller: userData.proStatus === 'approved',
    });

    await addDoc(collection(db, 'notifications'), {
      type: 'payout_request',
      message: `New payout request of ${seller.country === 'NG' ? '₦' : '£'}${amount.toFixed(2)} from seller ${sellerId}`,
      createdAt: serverTimestamp(),
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
 * /complete-purchase:
 *   post:
 *     summary: Complete a purchase
 *     description: Process a purchase and credit seller's wallet
 *     tags: [Sellers]
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
 *               amount:
 *                 type: number
 *               productPrice:
 *                 type: number
 *     responses:
 *       200:
 *         description: Purchase completed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
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
      totalEarnings: increment(sellerEarnings),
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

    res.json({ status: 'success', message: 'Purchase completed, seller credited to available balance' });
  } catch (error) {
    console.error('Purchase error:', error.message, { sellerId: req.body.sellerId });
    res.status(500).json({ error: 'Failed to complete purchase', details: error.message });
  }
});

/**
 * @swagger
 * /approve-payout:
 *   post:
 *     summary: Approve a payout
 *     description: Approve a payout request and process the transfer
 *     tags: [Sellers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *               - sellerId
 *               - amount
 *             properties:
 *               transactionId:
 *                 type: string
 *               sellerId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Payout approved successfully
 *       400:
 *         description: Invalid request or insufficient balance
 *       404:
 *         description: Transaction or seller not found
 *       500:
 *         description: Server error
 */
router.post('/approve-payout', async (req, res) => {
  try {
    const { transactionId, sellerId, amount } = req.body;
    if (!transactionId || !sellerId || !amount) {
      return res.status(400).json({ error: 'Missing transactionId, sellerId, or amount', details: { transactionId, sellerId, amount } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }
    const transactionData = transactionSnap.data();
    if (transactionData.sellerId !== sellerId) {
      return res.status(400).json({ error: 'Seller ID does not match transaction', details: { transactionId, sellerId } });
    }
    if (transactionData.status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid transaction status', details: { transactionId, status: transactionData.status } });
    }
    if (transactionData.amount !== amount) {
      return res.status(400).json({ error: 'Requested amount does not match transaction amount', details: { requested: amount, transaction: transactionData.amount } });
    }
    const { country, paystackRecipientCode, stripeAccountId } = transactionData;

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
    if (walletData.pendingWithdrawals < amount) {
      return res.status(400).json({ error: 'Insufficient pending withdrawals for payout', details: { pendingWithdrawals: walletData.pendingWithdrawals, amount } });
    }

    if (country === 'NG') {
      const recipientCode = paystackRecipientCode || sellerData.paystackRecipientCode;
      if (!recipientCode) {
        return res.status(400).json({ error: 'Seller has not completed Paystack onboarding', details: { sellerId, paystackRecipientCode } });
      }

      const balanceResponse = await axios.get('https://api.paystack.co/balance', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        timeout: 30000,
      });
      const paystackBalance = balanceResponse.data.data[0].balance / 100;
      if (paystackBalance < amount) {
        return res.status(400).json({
          error: 'Insufficient Paystack balance for transfer',
          details: { paystackBalance, amount },
        });
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
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, timeout: 30000 }
      );

      if (response.data.status && ['success', 'pending'].includes(response.data.data.status)) {
        await updateDoc(walletRef, {
          pendingWithdrawals: increment(-amount),
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
          createdAt: serverTimestamp(),
          details: { transactionId, sellerId, email: sellerData.email },
        });
        return res.json({
          status: 'success',
          message: 'Payout processed and credited to seller account in real-time',
          transferReference: response.data.data.reference,
        });
      } else {
        throw new Error(response.data.message || 'Transfer initiation failed');
      }
    } else if (country === 'GB') {
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
        pendingWithdrawals: increment(-amount),
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
        createdAt: serverTimestamp(),
        details: { transactionId, sellerId, email: sellerData.email },
      });
      return res.json({
        status: 'success',
        message: 'Payout processed for UK seller in real-time',
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
 *     summary: Reject a payout
 *     description: Reject a payout request and refund the amount to the seller's wallet
 *     tags: [Sellers]
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
 *               sellerId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payout rejected successfully
 *       400:
 *         description: Invalid request or transaction
 *       404:
 *         description: Transaction or wallet not found
 *       500:
 *         description: Server error
 */
router.post('/reject-payout', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId', details: { transactionId, sellerId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }
    if (transactionSnap.data().sellerId !== sellerId) {
      return res.status(400).json({ error: 'Seller ID does not match transaction', details: { transactionId, sellerId } });
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
      pendingWithdrawals: increment(-amount),
      updatedAt: serverTimestamp(),
    });

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists() && sellerSnap.data().email) {
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_rejected',
        message: `Payout request of ${sellerSnap.data().country === 'NG' ? '₦' : '£'}${amount.toFixed(2)} for transaction ${transactionId} rejected and refunded to wallet`,
        createdAt: serverTimestamp(),
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

/**
 * @swagger
 * /paystack-webhook:
 *   post:
 *     summary: Handle Paystack webhook
 *     description: Process Paystack webhook events for transfer success or failure
 *     tags: [Sellers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 *       500:
 *         description: Server error
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
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    if (event.event === 'transfer.success') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        const { sellerId, amount } = transactionSnap.data();
        const walletRef = doc(db, 'wallets', sellerId);
        await updateDoc(walletRef, {
          pendingWithdrawals: increment(-amount),
          updatedAt: serverTimestamp(),
        });
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
            createdAt: serverTimestamp(),
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
            pendingWithdrawals: increment(-amount),
            updatedAt: serverTimestamp(),
          });
        }
        const sellerRef = doc(db, 'sellers', sellerId);
        const sellerSnap = await getDoc(sellerRef);
        if (sellerSnap.exists() && sellerSnap.data().email) {
          await addDoc(collection(db, 'notifications'), {
            type: 'payout_failed',
            message: `Payout of ₦${amount.toFixed(2)} for transaction ${event.data.metadata.transactionId} failed and refunded to wallet`,
            createdAt: serverTimestamp(),
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

/**
 * @swagger
 * /delete-transaction:
 *   post:
 *     summary: Delete a transaction
 *     description: Delete a transaction from the database
 *     tags: [Sellers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *             properties:
 *               transactionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
router.post('/delete-transaction', async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required', details: { transactionId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }

    await deleteDoc(transactionRef);
    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error.message, { transactionId: req.body.transactionId });
    res.status(500).json({ error: 'Failed to delete transaction', details: error.message });
  }
});

module.exports = router;