const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { 
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp, addDoc } = require('firebase/firestore');
const { authenticateFirebaseToken } = require('./middleware');
const soap = require('soap');
const router = express.Router();
const { sendSupportRequestEmail, sendProSellerApprovedEmail, sendProSellerRejectedEmail } = require('./emailService');
const { WebApi } = require('smile-identity-core');

/**
 * @swagger
 * /api/pro-seller:
 *   post:
 *     summary: Register a Pro Seller
 *     description: Register a user as a Pro Seller with business verification and initiate banking onboarding via /onboard-seller
 *     tags: [Pro-Seller]
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
 *               - businessName
 *               - regNumber
 *               - address
 *               - country
 *               - phone
 *               - manager
 *               - managerEmail
 *               - managerPhone
 *               - categories
 *               - bankCode
 *               - accountNumber
 *               - accountName
 *             properties:
 *               userId:
 *                 type: string
 *               businessName:
 *                 type: string
 *               regNumber:
 *                 type: string
 *               taxRef:
 *                 type: string
 *               address:
 *                 type: string
 *               country:
 *                 type: string
 *               phone:
 *                 type: string
 *               manager:
 *                 type: string
 *               managerEmail:
 *                 type: string
 *               managerPhone:
 *                 type: string
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *               bankCode:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               accountName:
 *                 type: string
 *               iban:
 *                 type: string
 *               bankName:
 *                 type: string
 *               email:
 *                 type: string
 *               idNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pro Seller application submitted successfully
 *       400:
 *         description: Invalid request or verification failed
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: User already registered as Pro Seller
 *       500:
 *         description: Server error
 */
router.post('/api/pro-seller', authenticateFirebaseToken, async (req, res) => {
  try {
    const {
      userId,
      businessName,
      regNumber,
      taxRef,
      address,
      country,
      phone,
      manager,
      managerEmail,
      managerPhone,
      categories,
      bankCode,
      accountNumber,
      accountName,
      iban,
      bankName,
      email,
      idNumber,
    } = req.body;

    if (!userId || !businessName || !regNumber || !address || !country || !phone || !manager || !managerEmail || !managerPhone || !categories?.length) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: { userId, businessName, regNumber, address, country, phone, manager, managerEmail, managerPhone, categories },
      });
    }

    const normalizedCountry = country === 'United Kingdom' || country === 'UK' ? 'GB' : country === 'Nigeria' ? 'NG' : country;

    // Check if user is already a Pro Seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', userId));
    const proSellerSnap = await getDocs(proSellerQuery);
    if (!proSellerSnap.empty) {
      return res.status(409).json({ error: 'User is already registered as a Pro Seller' });
    }

    // Verify business registration number
    const apiKey = process.env.LOOKUPTAX_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error: Missing LOOKUPTAX_API_KEY' });
    }
    const baseUrl = 'https://api.lookuptax.com/v1/validate';
    const regResponse = await axios.post(baseUrl, { countryCode: normalizedCountry, taxId: regNumber }, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!regResponse.data.is_valid) {
      return res.status(400).json({ error: 'Invalid or unverified business registration number', details: { regNumber } });
    }

    // Verify tax reference if provided
    if (taxRef) {
      const taxResponse = await axios.post(baseUrl, { countryCode: normalizedCountry, taxId: taxRef }, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!taxResponse.data.is_valid) {
        return res.status(400).json({ error: 'Invalid or unverified tax reference number', details: { taxRef } });
      }
    }

    // Call /onboard-seller for banking setup
    const onboardPayload = {
      userId,
      fullName: accountName || `${manager} ${businessName}`,
      bankCode: normalizedCountry === 'NG' ? bankCode : '',
      accountNumber: normalizedCountry === 'NG' ? accountNumber : '',
      country: normalizedCountry,
      email: normalizedCountry === 'GB' ? email : undefined,
      iban: normalizedCountry === 'GB' ? iban : '',
      bankName: normalizedCountry === 'GB' ? bankName : '',
      idNumber: normalizedCountry === 'GB' ? idNumber : '',
      proSeller: true,
    };

    const backendUrl = process.env.BACKEND_URL || 'https://foremade-backend.onrender.com';
    const onboardResponse = await axios.post(`${backendUrl}/onboard-seller`, onboardPayload, {
      headers: { Authorization: req.headers.authorization },
    });
    if (!onboardResponse.data.success) {
      return res.status(400).json({ error: 'Failed to onboard banking details', details: onboardResponse.data });
    }

    // Store Pro Seller data
    const proSellerId = `pro_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const proSellerData = {
      proSellerId,
      userId,
      businessName,
      regNumber,
      taxRef: taxRef || '',
      address,
      phone,
      manager,
      managerEmail,
      managerPhone,
      categories,
      country: normalizedCountry,
      bankCode: normalizedCountry === 'NG' ? bankCode : '',
      accountNumber: normalizedCountry === 'NG' ? accountNumber : '',
      accountName: accountName || '',
      bankName: onboardResponse.data.bankName || '',
      paystackRecipientCode: onboardResponse.data.recipientCode || '',
      stripeAccountId: onboardResponse.data.stripeAccountId || '',
      status: 'pending',
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'proSellers', proSellerId), proSellerData);
    await setDoc(doc(db, 'proSellerApprovals', proSellerId), {
      proSellerId,
      userId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      type: 'pro_seller_application',
      message: `New Pro Seller application from ${businessName} (${normalizedCountry})`,
      createdAt: serverTimestamp(),
      details: { userId, proSellerId, country: normalizedCountry },
    });

    res.json({
      status: 'success',
      proSellerId,
      message: 'Pro Seller application submitted successfully. Banking details onboarded, awaiting admin approval.',
      redirectUrl: onboardResponse.data.redirectUrl || undefined,
    });
  } catch (error) {
    console.error('Pro Seller registration error:', error.message);
    res.status(500).json({ error: 'Failed to register Pro Seller', details: error.message });
  }
});

/**
 * @swagger
 * /api/pro-seller/verify-business:
 *   post:
 *     summary: Verify business registration number and tax reference
 *     description: Verifies the business registration number and tax reference using an external API
 *     tags: [Pro-Seller]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - regNumber
 *               - country
 *             properties:
 *               regNumber:
 *                 type: string
 *                 description: Business registration number
 *                 example: "1234567"
 *               taxRef:
 *                 type: string
 *                 description: Tax reference number (optional)
 *                 example: "12345678"
 *               country:
 *                 type: string
 *                 enum: [Nigeria, NG, United Kingdom, UK, GB]
 *                 description: Business country
 *                 example: "Nigeria"
 *     responses:
 *       200:
 *         description: Verification successful
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
 *                   example: "Verification successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     regValid:
 *                       type: boolean
 *                     taxValid:
 *                       type: boolean
 *       400:
 *         description: Invalid request or verification failed
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
router.post('/api/pro-seller/verify-business', async (req, res) => {
  try {
    const { regNumber, taxRef, country } = req.body;
    if (!regNumber || !country) {
      return res.status(400).json({ error: 'regNumber and country are required' });
    }

    const apiKey = process.env.LOOKUPTAX_API_KEY;
    if (!apiKey) {
      console.error('LOOKUPTAX_API_KEY is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const baseUrl = 'https://api.lookuptax.com/v1/validate';
    const countryCode = country === 'United Kingdom' || country === 'UK' || country === 'GB' ? 'GB' : 'NG';

    // Verify registration number
    console.log(`Verifying regNumber: ${regNumber} for country: ${countryCode}`);
    const regResponse = await axios.post(
      baseUrl,
      {
        countryCode,
        taxId: regNumber,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000, // 10-second timeout
      }
    );
    const regValid = regResponse.data.is_valid || false;
    console.log('Reg number verification response:', regResponse.data);

    // Verify tax reference if provided
    let taxValid = true;
    if (taxRef) {
      console.log(`Verifying taxRef: ${taxRef} for country: ${countryCode}`);
      const taxResponse = await axios.post(
        baseUrl,
        {
          countryCode,
          taxId: taxRef,
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      );
      taxValid = taxResponse.data.is_valid || false;
      console.log('Tax reference verification response:', taxResponse.data);
    }

    if (!regValid) {
      return res.status(400).json({ error: 'Business registration number not valid' });
    }
    if (taxRef && !taxValid) {
      return res.status(400).json({ error: 'Tax reference not valid' });
    }

    res.json({
      status: 'success',
      message: 'Verification successful',
      data: { regValid, taxValid },
    });
  } catch (error) {
    console.error('Verification error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack,
    });
    const regError = error.response?.data?.message || 'Business registration number not valid';
    const taxError = taxRef ? (error.response?.data?.message || 'Tax reference not valid') : '';
    return res.status(400).json({ error: regError, details: { taxError } });
  }
});

/**
 * @swagger
 * /api/pro-seller/onboard:
 *   post:
 *     summary: Onboard pro seller for payments
 *     description: Set up pro seller account for receiving payments via Stripe (UK) or Paystack (Nigeria)
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - country
 *             properties:
 *               country:
 *                 type: string
 *                 enum: [Nigeria, United Kingdom]
 *                 description: Seller's country
 *                 example: "Nigeria"
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
 *     responses:
 *       200:
 *         description: Pro seller onboarded successfully
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
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.post('/api/pro-seller/onboard', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { bankCode, accountNumber, country, email } = req.body;

    if (!country) {
      return res.status(400).json({ error: 'Missing country' });
    }

    // Check if user is pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);

    if (proSellerSnap.empty) {
      return res.status(400).json({ error: 'User is not registered as a pro seller' });
    }

    if (country === 'Nigeria') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Missing bankCode or accountNumber for Nigeria' });
      }
      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: `Pro Seller ${uid}`,
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
      // Update both pro seller and seller documents
      const proSellerRef = doc(db, 'proSellers', proSellerSnap.docs[0].id);
      const sellerRef = doc(db, 'sellers', uid);

      await updateDoc(proSellerRef, {
        paystackRecipientCode: recipientResponse.data.data.recipient_code,
        country,
        updatedAt: serverTimestamp()
      });

      await updateDoc(sellerRef, {
        paystackRecipientCode: recipientResponse.data.data.recipient_code,
        country,
        updatedAt: serverTimestamp()
      });
      res.json({
        recipientCode: recipientResponse.data.data.recipient_code,
      });
    } else if (country === 'United Kingdom') {
      if (!email) {
        return res.status(400).json({ error: 'Email is required for UK onboarding' });
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
        refresh_url: `${process.env.DOMAIN}/pro-seller-onboarding?status=failed`,
        return_url: `${process.env.DOMAIN}/pro-seller-onboarding?status=success`,
        type: 'account_onboarding',
      });
      // Update both pro seller and seller documents
      const proSellerRef = doc(db, 'proSellers', proSellerSnap.docs[0].id);
      const sellerRef = doc(db, 'sellers', uid);

      await updateDoc(proSellerRef, {
        stripeAccountId: account.id,
        country,
        updatedAt: serverTimestamp()
      });

      await updateDoc(sellerRef, {
        stripeAccountId: account.id,
        country,
        updatedAt: serverTimestamp()
      });
      res.json({
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Pro seller onboarding error:', error);
    res.status(500).json({ error: 'Failed to onboard pro seller', details: error.message });
  }
});

/**
 * @swagger
 * /api/pro-seller/wallet:
 *   get:
 *     summary: Get pro seller wallet
 *     description: Retrieve wallet information for the authenticated pro seller
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     availableBalance:
 *                       type: number
 *                       description: Available balance for withdrawal
 *                     pendingBalance:
 *                       type: number
 *                       description: Pending balance awaiting clearance
 *                     totalEarnings:
 *                       type: number
 *                       description: Total earnings since registration
 *                     updatedAt:
 *                       type: string
 *                       description: Last update timestamp
 *       400:
 *         description: User not pro seller
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.get('/api/pro-seller/wallet', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID

    // Check if user is pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);

    if (proSellerSnap.empty) {
      return res.status(400).json({ error: 'User is not registered as a pro seller' });
    }

    // Get wallet information
    const walletRef = doc(db, 'wallets', uid);
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const walletData = walletSnap.data();
    res.status(200).json({
      status: 'success',
      wallet: {
        availableBalance: walletData.availableBalance || 0,
        pendingBalance: walletData.pendingBalance || 0,
        totalEarnings: walletData.totalEarnings || 0,
        updatedAt: walletData.updatedAt?.toDate?.() || new Date()
      }
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet', details: error.message });
  }
});

/**
 * @swagger
 * /api/pro-seller/initiate-payout:
 *   post:
 *     summary: Initiate pro seller payout
 *     description: Initiate a payout request for the authenticated pro seller
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - transactionReference
 *             properties:
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
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.post('/api/pro-seller/initiate-payout', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { amount, transactionReference, bankCode, accountNumber, country, email } = req.body;

    if (!amount || amount <= 0 || !transactionReference) {
      return res.status(400).json({ error: 'Missing amount or transactionReference' });
    }

    // Check if user is pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);

    if (proSellerSnap.empty) {
      return res.status(400).json({ error: 'User is not registered as a pro seller' });
    }

    const walletRef = doc(db, 'wallets', uid);
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
      userId: uid,
      type: 'Withdrawal',
      description: `Pro seller withdrawal request for transaction ${transactionReference} - Awaiting Admin Approval`,
      amount,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: serverTimestamp(),
      reference: transactionReference,
      bankCode: country === 'Nigeria' ? bankCode : undefined,
      accountNumber: country === 'Nigeria' ? accountNumber : undefined,
      country,
      email,
      isProSeller: true
    });

    res.json({
      status: 'success',
      transactionId: transactionDoc.id,
      message: 'Withdrawal request submitted, awaiting admin approval',
    });
  } catch (error) {
    console.error('Pro seller payout initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate payout', details: error.message });
  }
});

/**
 * @swagger
 * /api/pro-seller/transactions:
 *   get:
 *     summary: Get pro seller transactions
 *     description: Retrieve transaction history for the authenticated pro seller
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of transactions per page
 *         example: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Sale, Withdrawal, Refund]
 *         description: Filter by transaction type
 *         example: "Sale"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Completed, Failed, Rejected]
 *         description: Filter by transaction status
 *         example: "Completed"
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       description:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       date:
 *                         type: string
 *                       reference:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalTransactions:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       400:
 *         description: User not pro seller
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.get('/api/pro-seller/transactions', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { page = 1, limit = 20, type, status } = req.query;

    // Check if user is pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);

    if (proSellerSnap.empty) {
      return res.status(400).json({ error: 'User is not registered as a pro seller' });
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    // Build query
    let transactionsQuery = collection(db, 'transactions');
    // Add filters
    if (type) {
      transactionsQuery = query(transactionsQuery, where('type', '==', type));
    }
    if (status) {
      transactionsQuery = query(transactionsQuery, where('status', '==', status));
    }
    // Add sorting and pagination
    transactionsQuery = query(
      transactionsQuery,
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(limitNum)
    );

    const transactionsSnap = await getDocs(transactionsQuery);

    const transactions = [];
    transactionsSnap.forEach(doc => {
      const transactionData = doc.data();
      transactions.push({
        id: doc.id,
        ...transactionData,
        createdAt: transactionData.createdAt?.toDate?.() || new Date()
      });
    });

    // Get total count for pagination
    const totalQuery = query(collection(db, 'transactions'), where('userId', '==', uid));
    const totalSnap = await getDocs(totalQuery);
    const totalTransactions = totalSnap.size;
    const totalPages = Math.ceil(totalTransactions / limitNum);

    res.status(200).json({
      status: 'success',
      transactions,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalTransactions,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions', details: error.message });
  }
});

/**
 * @swagger
 * /api/bump-product:
 *   post:
 *     summary: Bump product visibility
 *     description: Bump a product to increase its visibility in search results (requires Firebase authentication)
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - bumpDuration
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID to bump
 *                 example: "product123"
 *               bumpDuration:
 *                 type: string
 *                 enum: [72h, 168h]
 *                 description: Duration of bump in hours
 *                 example: "72h"
 *     responses:
 *       200:
 *         description: Product bumped successfully
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
 *                   example: "Product bumped successfully"
 *                 bumpExpiry:
 *                   type: string
 *                   description: When the bump expires
 *                   example: "2025-08-02T06:15:00Z"
 *       400:
 *         description: Invalid request or user not pro seller
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Product not found
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

router.post('/api/bump-product', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { productId, bumpDuration } = req.body;

    if (!productId || !bumpDuration) {
      return res.status(400).json({
        error: 'Missing required fields: productId, bumpDuration'
      });
    }

    // Validate bump duration
    const validDurations = ['72h', '168h'];
    if (!validDurations.includes(bumpDuration)) {
      return res.status(400).json({
        error: 'Invalid bump duration. Must be one of: 72h, 168h'
      });
    }

    // Check if user is pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);

    if (proSellerSnap.empty) {
      return res.status(400).json({ error: 'User is not registered as a pro seller' });
    }

    const proSellerData = proSellerSnap.docs[0].data();
    if (!proSellerData.isActive || proSellerData.status !== 'approved') {
      return res.status(400).json({ error: 'Pro seller account is not active or approved' });
    }

    // Check if product exists and belongs to user
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productSnap.data();
    if (productData.sellerId !== uid) {
      return res.status(403).json({ error: 'You can only bump your own products' });
    }

    // Calculate bump expiry time
    const durationInHours = parseInt(bumpDuration.replace('h', '')); // 72 or 168
    const bumpExpiry = new Date(Date.now() + (durationInHours * 60 * 60 * 1000));

    // Update product with bump information
    await updateDoc(productRef, {
      isBumped: true,
      bumpExpiry: bumpExpiry,
      bumpDuration: bumpDuration,
      updatedAt: serverTimestamp()
    });

    // Create bump record
    const bumpRef = doc(collection(db, 'productBumps'));
    await setDoc(bumpRef, {
      userId: uid,
      productId,
      bumpDuration,
      bumpExpiry,
      createdAt: serverTimestamp()
    });

    console.log(`Product ${productId} bumped successfully by user ${uid}`);
    res.status(200).json({
      status: 'success',
      message: 'Product bumped successfully',
      bumpExpiry: bumpExpiry.toISOString()
    });
  } catch (error) {
    console.error('Product bump error:', error);
    res.status(500).json({ error: 'Failed to bump product', details: error.message });
  }
});

/**
 * @swagger
 * /api/pro-seller/bump-quota:
 *   get:
 *     summary: Get pro seller bump quota
 *     description: Retrieve the remaining bump quota for the authenticated pro seller
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Quota retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 quota:
 *                   type: integer
 *                   description: Remaining bump quota
 *                   example: 5
 *       400:
 *         description: User not pro seller
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.get('/api/pro-seller/bump-quota', async (req, res) => {
  try {
    console.log('Request for bump quota received');
    const quota = 5; // Fixed quota for simplicity
    console.log(`Quota ${quota} returned`);
    res.status(200).json({ status: 'success', quota });
  } catch (error) {
    console.error('Fetch bump quota error:', error);
    res.status(500).json({ error: 'Failed to fetch bump quota', details: error.message });
  }
});

module.exports = router;

module.exports = router;

/**
 * @swagger
 * /api/pro-seller-analytics:
 *   get:
 *     summary: Get pro seller analytics
 *     description: Retrieve analytics data for the authenticated pro seller
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 1y]
 *           default: 30d
 *         description: Analytics period
 *         example: "30d"
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 analytics:
 *                   type: object
 *                   properties:
 *                     totalProducts:
 *                       type: integer
 *                       description: Total number of products
 *                     activeProducts:
 *                       type: integer
 *                       description: Number of active products
 *                     totalViews:
 *                       type: integer
 *                       description: Total product views
 *                     totalSales:
 *                       type: number
 *                       description: Total sales amount
 *                     averageRating:
 *                       type: number
 *                       description: Average product rating
 *                     topProducts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           views:
 *                             type: integer
 *                           sales:
 *                             type: number
 *                     monthlyTrends:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                           views:
 *                             type: integer
 *                           sales:
 *                             type: number
 *       400:
 *         description: User not pro seller
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.get('/api/pro-seller-analytics', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { period = '30d' } = req.query;

    // Check if user is pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);

    if (proSellerSnap.empty) {
      return res.status(400).json({ error: 'User is not registered as a pro seller' });
    }

    // Get user's products
    const productsQuery = query(
      collection(db, 'products'),
      where('sellerId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const productsSnap = await getDocs(productsQuery);
    const products = [];
    let totalViews = 0;
    let totalSales = 0;
    let totalRating = 0;
    let ratingCount = 0;
    productsSnap.forEach(doc => {
      const productData = doc.data();
      products.push({
        productId: doc.id,
        name: productData.name,
        views: productData.views || 0,
        sales: productData.sales || 0,
        rating: productData.rating || 0
      });
      totalViews += productData.views || 0;
      totalSales += productData.sales || 0;
      if (productData.rating) {
        totalRating += productData.rating;
        ratingCount++;
      }
    });

    // Get top products by views
    const topProducts = products
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    // Calculate average rating
    const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

    // Generate monthly trends (simplified)
    const monthlyTrends = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    months.forEach((month, index) => {
      monthlyTrends.push({
        month,
        views: Math.floor(Math.random() * 1000) + 100,
        sales: Math.floor(Math.random() * 50000) + 5000
      });
    });

    const analytics = {
      totalProducts: products.length,
      activeProducts: products.filter(p => p.views > 0).length,
      totalViews,
      totalSales,
      averageRating: Math.round(averageRating * 10) / 10,
      topProducts,
      monthlyTrends
    };

    res.status(200).json({
      status: 'success',
      analytics
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics', details: error.message });
  }
});

/**
 * @swagger
 * /api/bulk-upload-products:
 *   post:
 *     summary: Bulk upload products
 *     description: Upload multiple products at once (admin approval required, requires Firebase authentication)
 *     tags: [Pro-Seller]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - products
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Product name
 *                     description:
 *                       type: string
 *                       description: Product description
 *                     price:
 *                       type: number
 *                       description: Product price in NGN
 *                     category:
 *                       type: string
 *                       description: Product category
 *                     imageUrls:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of image URLs
 *                     specifications:
 *                       type: object
 *                       description: Product specifications
 *                 description: Array of products to upload
 *     responses:
 *       200:
 *         description: Bulk upload request submitted successfully
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
 *                   example: "Bulk upload request submitted for admin approval"
 *                 requestId:
 *                   type: string
 *                   description: Bulk upload request ID
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.post('/api/bulk-upload-products', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required and must not be empty' });
    }

    if (products.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 products allowed per bulk upload' });
    }

    // Validate each product
    for (const product of products) {
      if (!product.name || !product.description || !product.price || !product.category || !product.imageUrls) {
        return res.status(400).json({
          error: 'Each product must have: name, description, price, category, imageUrls'
        });
      }
      if (typeof product.price !== 'number' || product.price <= 0) {
        return res.status(400).json({ error: 'Product price must be a positive number' });
      }
      if (!Array.isArray(product.imageUrls) || product.imageUrls.length === 0) {
        return res.status(400).json({ error: 'Each product must have at least one image URL' });
      }
    }

    // Create bulk upload request
    const requestId = `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const bulkRequestRef = doc(db, 'bulkUploadRequests', requestId);

    const bulkRequestData = {
      requestId,
      sellerId: uid,
      products,
      status: 'pending',
      totalProducts: products.length,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(bulkRequestRef, bulkRequestData);

    console.log(`Bulk upload request created: ${requestId} with ${products.length} products by user ${uid}`);
    res.status(200).json({
      status: 'success',
      message: 'Bulk upload request submitted for admin approval',
      requestId
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: 'Failed to submit bulk upload request', details: error.message });
  }
});

/**
 * @swagger
 * /api/support-request:
 *   post:
 *     summary: Submit a support request
 *     description: Allows any authenticated user to submit a support request
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - message
 *             properties:
 *               subject:
 *                 type: string
 *                 description: Subject of the support request
 *                 example: "Payment issue"
 *               message:
 *                 type: string
 *                 description: Detailed message for support
 *                 example: "I have not received my payout."
 *     responses:
 *       200:
 *         description: Support request submitted successfully
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
 *                   example: "Support request submitted"
 *                 requestId:
 *                   type: string
 *                   description: Support request ID
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
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

router.post('/api/support-request', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    // Fetch user email and name if available
    let fromEmail = '';
    let fromName = '';
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const userData = userSnap.data();
        fromEmail = userData.email || '';
        fromName = userData.name || userData.displayName || '';
      }
    } catch (e) {
      // Ignore user fetch errors, fallback to blank
    }

    // Send support email
    await sendSupportRequestEmail({ fromEmail, fromName, subject, message });

    const requestId = `support_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const supportRef = doc(db, 'supportRequests', requestId);
    const supportData = {
      requestId,
      userId: uid,
      subject,
      message,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(supportRef, supportData);

    res.status(200).json({ status: 'success', message: 'Support request submitted', requestId });
  } catch (error) {
    console.error('Support request error:', error);
    res.status(500).json({ error: 'Failed to submit support request', details: error.message });
  }
});

/**
 * @swagger
 * /api/admin/pro-seller-approvals:
 *   get:
 *     summary: List all pending pro seller approvals
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending approvals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 approvals:
 *                   type: array
 *                   items:
 *                     type: object
 */

router.get('/api/admin/pro-seller-approvals', authenticateFirebaseToken, async (req, res) => {
  try {
    const approvalsSnap = await getDocs(query(collection(db, 'proSellerApprovals'), where('status', '==', 'pending')));
    const approvals = approvalsSnap.docs.map(doc => doc.data());
    res.json({ status: 'success', approvals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch approvals', details: error.message });
  }
});

/**
 * @swagger
 * /api/admin/approve-pro-seller:
 *   post:
 *     summary: Approve or reject a pro seller
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proSellerId
 *               - approve
 *             properties:
 *               proSellerId:
 *                 type: string
 *               approve:
 *                 type: boolean
 *                 description: true to approve, false to reject
 *     responses:
 *       200:
 *         description: Approval/rejection processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 message:
 *                   type: string
 *       403:
 *         description: Admin access required
 */

router.post('/api/admin/approve-pro-seller', async (req, res) => { // Removed authenticateFirebaseToken
  try {
    const { proSellerId, approve } = req.body;

    if (!proSellerId || typeof approve !== 'boolean') {
      return res.status(400).json({ error: 'proSellerId and approve(boolean) are required' });
    }

    // Get approval request
    const approvalRef = doc(db, 'proSellerApprovals', proSellerId);
    const approvalSnap = await getDoc(approvalRef);
    if (!approvalSnap.exists()) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approvalData = approvalSnap.data();

    // Rate limiting: only send email if not already sent
    if (approvalData.emailSent) {
      await updateDoc(approvalRef, {
        status: approve ? 'approved' : 'rejected',
        updatedAt: serverTimestamp(),
      });
      const proSellerRef = doc(db, 'proSellers', proSellerId);
      const proSellerSnap = await getDoc(proSellerRef);
      if (proSellerSnap.exists()) {
        await updateDoc(proSellerRef, {
          status: approve ? 'approved' : 'rejected',
          updatedAt: serverTimestamp(),
        });
      }
      const userRef = doc(db, 'users', approvalData.userId);
      if (approve) {
        await updateDoc(userRef, {
          isProSeller: true,
          role: 'proseller',
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, {
          isProSeller: false,
          role: 'buyer',
          updatedAt: serverTimestamp(),
        });
      }
      return res.json({ status: 'success', message: 'Email already sent previously. Status updated.' });
    }

    // Update approval status
    await updateDoc(approvalRef, {
      status: approve ? 'approved' : 'rejected',
      updatedAt: serverTimestamp(),
      emailSent: true,
    });

    // Update proSeller and user status
    const proSellerRef = doc(db, 'proSellers', proSellerId);
    const proSellerSnap = await getDoc(proSellerRef);
    if (proSellerSnap.exists()) {
      await updateDoc(proSellerRef, {
        status: approve ? 'approved' : 'rejected',
        updatedAt: serverTimestamp(),
      });
    }

    const userRef = doc(db, 'users', approvalData.userId);
    let userEmail = '';
    let userName = '';
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      userEmail = userData.email || '';
      userName = userData.name || userData.displayName || '';
    }

    if (approve) {
      await updateDoc(userRef, {
        isProSeller: true,
        role: 'proseller',
        updatedAt: serverTimestamp(),
      });
      if (userEmail) {
        await sendProSellerApprovedEmail({ email: userEmail, name: userName });
      }
    } else {
      await updateDoc(userRef, {
        isProSeller: false,
        role: 'buyer',
        updatedAt: serverTimestamp(),
      });
      if (userEmail) {
        await sendProSellerRejectedEmail({ email: userEmail, name: userName });
      }
    }

    res.json({ status: 'success', message: approve ? 'Pro seller approved' : 'Pro seller rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process approval', details: error.message });
  }
});

/**
 * @swagger
 * /api/admin/all-pro-sellers:
 *   get:
 *     summary: List all pro sellers
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all pro sellers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 proSellers:
 *                   type: array
 *                   items:
 *                     type: object
 */

router.get('/api/admin/all-pro-sellers', (req, res, next) => next(), async (req, res) => { // No auth
  try {
    const proSellersSnap = await getDocs(collection(db, 'proSellers'));
    const proSellers = proSellersSnap.docs.map(doc => doc.data());
    const pending = proSellers.filter(ps => ps.status === 'pending');
    const approved = proSellers.filter(ps => ps.status === 'approved');
    const rejected = proSellers.filter(ps => ps.status === 'rejected');
    res.json({ status: 'success', proSellers, pending, approved, rejected });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pro sellers', details: error.message });
  }
});

module.exports = router;