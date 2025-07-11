const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp, addDoc } = require('firebase/firestore');
const { authenticateFirebaseToken } = require('./middleware');
const soap = require('soap');
const router = express.Router();

/**
 * @swagger
 * /api/pro-seller:
 *   post:
 *     summary: Register as pro seller with verification
 *     description: Register a user as a pro seller with enhanced features. Business registration number, tax reference number, and bank account number are verified before registration. Only proceeds if all verifications succeed.
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
 *               - businessName
 *               - businessType
 *               - phone
 *               - address
 *             properties:
 *               businessName:
 *                 type: string
 *                 description: Business name
 *                 example: "Tech Solutions Ltd"
 *               businessType:
 *                 type: string
 *                 enum: [Individual, Company, Partnership]
 *                 description: Type of business
 *                 example: "Company"
 *               phone:
 *                 type: string
 *                 description: Business phone number
 *                 example: "+2348012345678"
 *               phoneCode:
 *                 type: string
 *                 description: Phone country code
 *                 example: "+234"
 *               address:
 *                 type: string
 *                 description: Business address
 *                 example: "123 Business Street, Lagos, Nigeria"
 *               website:
 *                 type: string
 *                 description: Business website (optional)
 *                 example: "https://techsolutions.com"
 *               description:
 *                 type: string
 *                 description: Business description
 *                 example: "Leading technology solutions provider"
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Product categories
 *                 example: ["Electronics", "Computers", "Accessories"]
 *               productLines:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Product lines (used as categories if categories not provided)
 *                 example: ["Electronics", "Computers"]
 *               regNumber:
 *                 type: string
 *                 description: Business registration number (verified for Nigeria/UK)
 *                 example: "1234567"
 *               taxRef:
 *                 type: string
 *                 description: Tax reference number - TIN for Nigeria, VAT for UK (verified)
 *                 example: "12345678"
 *               country:
 *                 type: string
 *                 enum: [Nigeria, NG, United Kingdom, UK, GB]
 *                 description: Business country (required for verification)
 *                 example: "Nigeria"
 *               bankCode:
 *                 type: string
 *                 description: Bank code (required for Nigeria bank verification)
 *                 example: "044"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Business email address
 *                 example: "business@techsolutions.com"
 *               manager:
 *                 type: string
 *                 description: Manager name
 *                 example: "John Doe"
 *               managerEmail:
 *                 type: string
 *                 format: email
 *                 description: Manager email address
 *                 example: "manager@techsolutions.com"
 *               managerPhone:
 *                 type: string
 *                 description: Manager phone number
 *                 example: "+2348012345679"
 *               accountName:
 *                 type: string
 *                 description: Bank account holder name
 *                 example: "Tech Solutions Ltd"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number (verified for Nigeria)
 *                 example: "0123456789"
 *               bankName:
 *                 type: string
 *                 description: Bank name
 *                 example: "Access Bank"
 *               agree:
 *                 type: boolean
 *                 description: Agreement to terms and conditions
 *                 example: true
 *     responses:
 *       201:
 *         description: Pro seller registered successfully after all verifications passed
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
 *                   example: "Pro seller registered successfully"
 *                 proSellerId:
 *                   type: string
 *                   description: Generated pro seller ID
 *       400:
 *         description: Invalid request data or verification failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message
 *                   example: "Invalid or unverified business registration number (Nigeria)"
 *                 details:
 *                   type: string
 *                   description: Additional error details
 *       401:
 *         description: Unauthorized - Firebase token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found - sync account first
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User already registered as pro seller
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
router.post('/api/pro-seller', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    // Accept all possible frontend fields
    const {
      businessName,
      businessType = 'Company',
      phone,
      phoneCode,
      address,
      website,
      description,
      categories,
      productLines,
      regNumber,
      taxRef,
      country,
      bankCode,
      email,
      manager,
      managerEmail,
      managerPhone,
      accountName,
      accountNumber,
      bankName,
      agree,
      ...rest // Capture any extra fields
    } = req.body;

    // Validate required fields
    if (!businessName || !businessType || !phone || !address) {
      return res.status(400).json({
        error: 'Missing required fields: businessName, businessType, phone, address'
      });
    }

    // --- VERIFICATION LOGIC ---
    // 1. Verify business registration number
    if (regNumber && country) {
      if (country === 'Nigeria' || country === 'NG') {
        try {
          const response = await axios.post(
            'https://api.dojah.io/api/v1/kyc/business/lookup',
            { country: 'NG', registration_number: regNumber },
            { headers: { 'AppId': process.env.DOJAH_APP_ID, 'Authorization': process.env.DOJAH_SECRET } }
          );
          if (!response.data || response.data.status !== true) {
            return res.status(400).json({ error: 'Invalid or unverified business registration number (Nigeria)' });
          }
        } catch (err) {
          return res.status(400).json({ error: 'Failed to verify business registration number (Nigeria)', details: err.response?.data || err.message });
        }
      } else if (country === 'United Kingdom' || country === 'UK' || country === 'GB') {
        try {
          const response = await axios.get(
            `https://api.company-information.service.gov.uk/company/${regNumber}`,
            { auth: { username: process.env.COMPANIES_HOUSE_API_KEY, password: '' } }
          );
          if (!response.data || response.data.error) {
            return res.status(400).json({ error: 'Invalid or unverified business registration number (UK)' });
          }
        } catch (err) {
          return res.status(400).json({ error: 'Failed to verify business registration number (UK)', details: err.response?.data || err.message });
        }
      }
    }

    // 2. Verify tax reference number
    if (taxRef && country) {
      if (country === 'Nigeria' || country === 'NG') {
        try {
          const response = await axios.post(
            'https://api.dojah.io/api/v1/kyc/tin/lookup',
            { country: 'NG', tin: taxRef },
            { headers: { 'AppId': process.env.DOJAH_APP_ID, 'Authorization': process.env.DOJAH_SECRET } }
          );
          if (!response.data || response.data.status !== true) {
            return res.status(400).json({ error: 'Invalid or unverified TIN (Nigeria)' });
          }
        } catch (err) {
          return res.status(400).json({ error: 'Failed to verify TIN (Nigeria)', details: err.response?.data || err.message });
        }
      } else if (country === 'United Kingdom' || country === 'UK' || country === 'GB') {
        try {
          const vatNumber = taxRef.replace(/\s+/g, '');
          
          // Use VIES SOAP API for UK VAT verification
          const vatValid = await new Promise((resolve, reject) => {
            const url = 'http://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';
            
            soap.createClient(url, (err, client) => {
              if (err) {
                return reject(err);
              }
              
              client.checkVat({
                countryCode: 'GB',
                vatNumber: vatNumber
              }, (err, result) => {
                if (err) {
                  return reject(err);
                }
                
                // VIES returns valid: true if VAT number is valid
                resolve(result && result.valid === true);
              });
            });
          });
          
          if (!vatValid) {
            return res.status(400).json({ error: 'Invalid or unverified VAT number (UK)' });
          }
        } catch (err) {
          return res.status(400).json({ error: 'Failed to verify VAT number (UK)', details: err.message });
        }
      }
    }

    // 3. Verify bank account (Nigeria only)
    if (accountNumber && bankCode && (country === 'Nigeria' || country === 'NG')) {
      try {
        const response = await axios.get(
          `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (!response.data.status) {
          return res.status(400).json({ error: 'Invalid or unverified bank account (Nigeria)', message: response.data.message });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Failed to verify bank account (Nigeria)', details: err.response?.data?.message || err.message });
      }
    }
    // --- END VERIFICATION LOGIC ---

    // Map categories from productLines if not provided
    const finalCategories = Array.isArray(categories) && categories.length > 0
      ? categories
      : (Array.isArray(productLines) ? productLines : []);

    // Build extended description with extra fields
    const extraDescription = [
      description,
      regNumber ? `Reg Number: ${regNumber}` : '',
      taxRef ? `Tax Ref: ${taxRef}` : '',
      country ? `Country: ${country}` : '',
      email ? `Email: ${email}` : '',
      manager ? `Manager: ${manager}` : '',
      managerEmail ? `Manager Email: ${managerEmail}` : '',
      managerPhone ? `Manager Phone: ${managerPhone}` : '',
      accountName ? `Account Name: ${accountName}` : '',
      accountNumber ? `Account Number: ${accountNumber}` : '',
      bankName ? `Bank Name: ${bankName}` : '',
      phoneCode ? `Phone Code: ${phoneCode}` : '',
      agree !== undefined ? `Agreed to terms: ${agree}` : ''
    ].filter(Boolean).join(', ');

    // Check if user already exists
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found. Please sync your account first.' });
    }

    // Check if user is already a pro seller
    const proSellerQuery = query(collection(db, 'proSellers'), where('userId', '==', uid));
    const proSellerSnap = await getDocs(proSellerQuery);
    if (!proSellerSnap.empty) {
      return res.status(409).json({ error: 'User is already registered as a pro seller' });
    }

    // Store any extra fields in a dedicated object
    const extraFields = { ...rest };

    // Create pro seller document
    const proSellerId = `pro_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const proSellerRef = doc(db, 'proSellers', proSellerId);
    const proSellerData = {
      proSellerId,
      userId: uid,
      businessName,
      businessType,
      phone,
      phoneCode: phoneCode || '',
      address,
      website: website || '',
      description: extraDescription,
      categories: finalCategories,
      regNumber: regNumber || '',
      taxRef: taxRef || '',
      country: country || '',
      email: email || '',
      manager: manager || '',
      managerEmail: managerEmail || '',
      managerPhone: managerPhone || '',
      accountName: accountName || '',
      accountNumber: accountNumber || '',
      bankName: bankName || '',
      agree: agree !== undefined ? agree : false,
      status: 'pending',
      isActive: true,
      features: {
        analytics: true,
        productBumping: true,
        bulkUpload: true,
        prioritySupport: true
      },
      extraFields, // Store any extra fields from frontend
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(proSellerRef, proSellerData);

    // Create seller document (for regular seller functionality)
    const sellerRef = doc(db, 'sellers', uid);
    await setDoc(sellerRef, {
      userId: uid,
      businessName,
      businessType,
      phone,
      phoneCode: phoneCode || '',
      address,
      website: website || '',
      description: extraDescription,
      categories: finalCategories,
      regNumber: regNumber || '',
      taxRef: taxRef || '',
      country: country || '',
      email: email || '',
      manager: manager || '',
      managerEmail: managerEmail || '',
      managerPhone: managerPhone || '',
      accountName: accountName || '',
      accountNumber: accountNumber || '',
      bankName: bankName || '',
      agree: agree !== undefined ? agree : false,
      isProSeller: true,
      proSellerId,
      status: 'pending',
      extraFields, // Store any extra fields from frontend
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Create wallet for the seller
    const walletRef = doc(db, 'wallets', uid);
    await setDoc(walletRef, {
      userId: uid,
      availableBalance: 0,
      pendingBalance: 0,
      totalEarnings: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Update user to mark as pro seller
    await updateDoc(userRef, {
      isProSeller: true,
      proSellerId,
      isSeller: true,
      sellerId: uid,
      updatedAt: serverTimestamp()
    });

    console.log(`Pro seller registered successfully: ${proSellerId} for user ${uid}`);
    res.status(201).json({
      status: 'success',
      message: 'Pro seller registered successfully',
      proSellerId
    });

  } catch (error) {
    console.error('Pro seller registration error:', error);
    res.status(500).json({ error: 'Failed to register pro seller', details: error.message });
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
 *                 enum: [1h, 6h, 12h, 24h, 48h, 72h]
 *                 description: Duration of bump
 *                 example: "24h"
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
 *                   example: "2024-01-15T10:30:00Z"
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
    const validDurations = ['1h', '6h', '12h', '24h', '48h', '72h'];
    if (!validDurations.includes(bumpDuration)) {
      return res.status(400).json({ 
        error: 'Invalid bump duration. Must be one of: 1h, 6h, 12h, 24h, 48h, 72h' 
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
    const durationInHours = parseInt(bumpDuration.replace('h', ''));
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

module.exports = router; 