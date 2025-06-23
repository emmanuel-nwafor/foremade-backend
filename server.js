require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } = require('firebase/firestore');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// Log env vars for debugging
console.log('PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('DOMAIN:', process.env.DOMAIN || 'Missing');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Loaded' : 'Missing');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Loaded' : 'Missing');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, JPG, PNG, WEBP, GIF) and videos (MP4) are allowed.'));
    }
  },
});

// Configure CORS for production
app.use(cors({
  origin: process.env.DOMAIN || 'https://foremade-frontend.onrender.com',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Fetch banks endpoint
app.get('/fetch-banks', async (req, res) => {
  try {
    console.log('Fetching banks from Paystack');
    const response = await axios.get('https://api.paystack.co/bank?country=nigeria', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.data.status) {
      throw new Error('Failed to fetch banks from Paystack: ' + response.data.message);
    }

    const banks = response.data.data.map(bank => ({
      name: bank.name,
      code: bank.code,
    }));

    res.json(banks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks', details: error.message });
  }
});

// Verify bank account endpoint
app.post('/verify-bank-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Missing accountNumber or bankCode' });
    }

    console.log('Verifying bank account:', { accountNumber, bankCode });
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
      return res.status(400).json({ error: 'Failed to verify account', message: response.data.message });
    }

    res.json({
      status: 'success',
      accountName: response.data.data.account_name,
      accountNumber: response.data.data.account_number,
    });
  } catch (error) {
    console.error('Bank verification error:', error);
    res.status(500).json({ error: 'Failed to verify bank account', details: error.response?.data?.message || error.message });
  }
});

// Initiate payout endpoint
app.post('/initiate-payout', async (req, res) => {
  try {
    const { userId, amount, transactionReference, bankCode, accountNumber, country, email } = req.body;
    if (!userId || !amount || amount <= 0 || !transactionReference || !country || !email) {
      return res.status(400).json({ error: 'Missing required fields: userId, amount, transactionReference, country, or email' });
    }

    console.log('Initiating payout:', { userId, amount, transactionReference, country, email });

    const walletRef = doc(db, 'wallets', userId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found' });
    }
    const wallet = walletSnap.data();

    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance' });
    }

    if (country === 'Nigeria') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Missing bankCode or accountNumber for Nigeria' });
      }

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      let recipientCode = userSnap.exists() ? userSnap.data().paystackRecipientCode : null;

      if (!recipientCode) {
        console.log(`Creating Paystack recipient for user: ${userId}`);
        const recipientResponse = await axios.post(
          'https://api.paystack.co/transferrecipient',
          {
            type: 'nuban',
            name: `User ${userId}`,
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
          throw new Error('Failed to create Paystack transfer recipient: ' + recipientResponse.data.message);
        }

        recipientCode = recipientResponse.data.data.recipient_code;
        await setDoc(userRef, { paystackRecipientCode: recipientCode, email }, { merge: true });
      }

      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: `Payout for transaction ${transactionReference}`,
          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!transferResponse.data.status) {
        throw new Error('Failed to initiate Paystack transfer: ' + transferResponse.data.message);
      }

      await updateDoc(walletRef, {
        availableBalance: wallet.availableBalance - amount,
        updatedAt: serverTimestamp(),
      });

      const transactionDoc = await addDoc(collection(db, 'transactions'), {
        userId,
        type: 'Withdrawal',
        description: `Withdrawal for transaction ${transactionReference}`,
        amount,
        date: new Date().toISOString().split('T')[0],
        status: 'Pending', // Admin approval required
        createdAt: serverTimestamp(),
        reference: transactionReference,
        payoutReference: transferResponse.data.data.reference,
        bankCode,
        accountNumber,
        country,
        email,
      });

      // Send email notification to admin
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL || 'admin@foremade.com',
        subject: `New Withdrawal Request from User ${userId}`,
        text: `A withdrawal request of ₦${amount} has been submitted by user ${userId} for ${country}. Transaction ID: ${transactionDoc.id}. Please review in the admin panel.`,
      });

      res.json({
        status: 'success',
        transactionId: transactionDoc.id,
        reference: transferResponse.data.data.reference,
        message: 'Withdrawal request submitted successfully, awaiting admin approval',
      });
    } else if (country === 'United Kingdom') {
      const transactionDoc = await addDoc(collection(db, 'transactions'), {
        userId,
        type: 'Withdrawal',
        description: `Manual withdrawal request for ${transactionReference}`,
        amount,
        date: new Date().toISOString().split('T')[0],
        status: 'Pending',
        createdAt: serverTimestamp(),
        reference: transactionReference,
        country,
        email,
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL || 'admin@foremade.com',
        subject: `New UK Withdrawal Request from User ${userId}`,
        text: `A withdrawal request of ₦${amount} has been submitted by user ${userId} for the UK. Transaction ID: ${transactionDoc.id}. Please process manually.`,
      });

      res.json({
        status: 'success',
        transactionId: transactionDoc.id,
        message: 'UK withdrawal request submitted successfully, awaiting admin approval',
      });
    } else {
      res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Payout initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate payout', details: error.message });
  }
});

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const isVideo = req.body.isVideo === 'true';
    const uploadOptions = {
      folder: 'products',
      resource_type: isVideo ? 'video' : 'image',
    };

    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url, message: `${isVideo ? 'Video' : 'Image'} uploaded successfully` });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: `Failed to upload ${req.body.isVideo === 'true' ? 'video' : 'image'}`,
      details: error.message,
    });
  }
});

// Paystack webhook endpoint
app.post('/paystack-webhook', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      console.error('Invalid Paystack webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('Paystack webhook event:', event);

    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;
      const amountInKobo = amount;
      const userId = metadata.userId;
      const adminFees = metadata.adminFees || 0;

      const q = query(
        collection(db, 'transactions'),
        where('reference', '==', reference),
        where('status', '==', 'Initiated')
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        console.warn(`No Initiated transaction found for reference ${reference}`);
        return res.status(200).json({ status: 'success' });
      }

      const transactionDoc = doc(db, 'transactions', querySnapshot.docs[0].id);
      const netAmount = (amountInKobo - adminFees) / 100;

      const walletRef = doc(db, 'wallets', userId);
      const walletSnap = await getDoc(walletRef);
      const walletData = walletSnap.exists() ? walletSnap.data() : { availableBalance: 0, pendingBalance: 0 };

      await updateDoc(walletRef, {
        pendingBalance: (walletData.pendingBalance || 0) + netAmount,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(transactionDoc, {
        status: 'Completed',
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'transactions'), {
        userId,
        type: 'Sale',
        description: `Sale credited to pending balance for payment ${reference}`,
        amount: netAmount,
        date: new Date().toISOString().split('T')[0],
        status: 'Completed',
        createdAt: serverTimestamp(),
        reference,
      });

      console.log(`Processed charge.success for reference ${reference}: credited ${netAmount} to user ${userId}`);
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

// Verify Paystack payment endpoint
app.post('/verify-paystack-payment', async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.status || response.data.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful', details: response.data.message });
    }

    const q = query(
      collection(db, 'transactions'),
      where('reference', '==', reference),
      where('status', '==', 'Completed')
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return res.status(400).json({ error: 'Payment not confirmed in system' });
    }

    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error('Paystack verification error:', error);
    res.status(500).json({ error: 'Failed to verify payment', details: error.response?.data?.message || error.message });
  }
});

// Initiate Paystack payment endpoint
app.post('/initiate-paystack-payment', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }

    const { amount, email, currency = 'NGN', metadata } = req.body;
    console.log('Paystack Request Payload:', { amount, email, currency, metadata });

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!metadata?.userId) {
      return res.status(400).json({ error: 'User ID is required in metadata' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Paystack secret key not configured' });
    }

    const adminFees = (metadata?.handlingFee || 0) + (metadata?.buyerProtectionFee || 0) + (metadata?.taxFee || 0);
    const userId = metadata.userId;
    const reference = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const amountInKobo = Math.round(amount);
    if (isNaN(amountInKobo) || amountInKobo <= 0) {
      return res.status(400).json({ error: 'Invalid amount after rounding' });
    }

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        amount: amountInKobo,
        email,
        currency,
        reference,
        metadata: {
          ...metadata,
          adminFees,
        },
        callback_url: `${process.env.DOMAIN}/payment-callback`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.status) {
      return res.status(400).json({ error: 'Failed to initiate payment', details: response.data.message });
    }

    await addDoc(collection(db, 'transactions'), {
      userId,
      type: 'Sale',
      description: `Initiated payment for ${reference}`,
      amount: amountInKobo / 100,
      date: new Date().toISOString().split('T')[0],
      status: 'Initiated',
      createdAt: serverTimestamp(),
      reference,
    });

    res.json({
      status: 'success',
      authorization_url: response.data.data.authorization_url,
      access_code: response.data.data.access_code,
      reference,
    });
  } catch (error) {
    console.error('Paystack payment initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate payment', details: error.response?.data?.message || error.message });
  }
});

// Send product approved email endpoint
app.post('/send-product-approved-email', async (req, res) => {
  try {
    const { productId, productName, userId, email } = req.body;
    console.log('Received payload for product approved email:', { productId, productName, userId, email });

    if (!productId || !productName || !userId) {
      console.warn('Missing required fields:', { productId, productName, userId, email });
      return res.status(400).json({ error: 'Missing productId, productName, or userId' });
    }

    let userEmail = email;
    if (!userEmail) {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        console.warn(`User ${userId} not found in Firestore`);
        return res.status(400).json({ error: 'User not found' });
      }
      userEmail = userDoc.data().email;
      if (!userEmail) {
        console.warn(`No email found for user ${userId}`);
        return res.status(400).json({ error: 'No email found for user' });
      }
    }

    if (!/\S+@\S+\.\S+/.test(userEmail)) {
      console.warn('Invalid email format:', userEmail);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      console.warn(`Product ${productId} not found in Firestore`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const mailOptions = {
      from: `"Your Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: userEmail,
      subject: 'Your Product is Live on Foremade! 🎉',
      text: `Great news! Your product "${productName}" (ID: ${productId}) has been approved and is now live on Foremade. Log in to your dashboard to manage your listings: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a73e8;">Great News! Your Product is Live! 🎉</h2>
          <p>Your product <strong>"${productName}"</strong> (ID: ${productId}) has been approved and is now live on Foremade!</p>
          <p>Customers can now view and purchase your product. Manage your listings via your dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
          <p>Thank you for choosing Foremade!</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly. Contact <a href="mailto:support@foremade.com">support@foremade.com</a> for assistance.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Approval email sent to ${userEmail} for product ${productId}`);

    await updateDoc(productRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Approval email sent to user' });
  } catch (error) {
    console.error('Error sending product approved email:', error);
    res.status(500).json({ error: 'Failed to send approval email', details: error.message });
  }
});

// Send product rejected email endpoint
app.post('/send-product-rejected-email', async (req, res) => {
  try {
    const { productId, productName, userId, email, reason } = req.body;
    console.log('Received payload for product rejected email:', { productId, productName, userId, email, reason });

    if (!productId || !productName || !userId || !reason) {
      console.warn('Missing required fields:', { productId, productName, userId, email, reason });
      return res.status(400).json({ error: 'Missing productId, productName, userId, or reason' });
    }

    let userEmail = email;
    if (!userEmail) {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        console.warn(`User ${userId} not found in Firestore`);
        return res.status(400).json({ error: 'User not found' });
      }
      userEmail = userDoc.data().email;
      if (!userEmail) {
        console.warn(`No email found for user ${userId}`);
        return res.status(400).json({ error: 'No email found for user' });
      }
    }

    if (!/\S+@\S+\.\S+/.test(userEmail)) {
      console.warn('Invalid email format:', userEmail);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      console.warn(`Product ${productId} not found in Firestore`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const mailOptions = {
      from: `"Your Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: userEmail,
      subject: 'Update: Your Product Was Not Approved on Foremade',
      text: `Dear User, your product "${productName}" (ID: ${productId}) was not approved for listing on Foremade. Reason: ${reason}. Please review our guidelines and resubmit: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">Update: Your Product Was Not Approved</h2>
          <p>Dear User,</p>
          <p>Your product "<strong>${productName}</strong>" (ID: ${productId}) was not approved for listing on Foremade.</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>Please review our <a href="https://foremade.com/guidelines" style="color: #1a73e8;">guidelines</a> and update your product in the dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
          <p>Contact <a href="mailto:support@foremade.com" style="color: #1a73e8;">support@foremade.com</a> for assistance.</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Rejection email sent to ${userEmail} for product ${productId}`);

    await updateDoc(productRef, {
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Rejection email sent to user' });
  } catch (error) {
    console.error('Error sending product rejected email:', error);
    res.status(500).json({ error: 'Failed to send rejection email', details: error.message });
  }
});

// Send order confirmation endpoint
app.post('/send-order-confirmation', async (req, res) => {
  try {
    const { orderId, email, items, total, currency } = req.body;
    console.log('Received payload for order confirmation:', { orderId, email, items, total, currency });

    if (!orderId || !email || !items || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }
    if (typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ error: 'Total must be a positive number' });
    }
    if (!['ngn', 'gbp'].includes(currency?.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid currency' });
    }

    for (const item of items) {
      if (!item.name || !item.quantity || !item.price || !item.imageUrls || !Array.isArray(item.imageUrls)) {
        return res.status(400).json({ error: 'Invalid item structure' });
      }
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemRows = items.map((item) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px;">
          <img src="${item.imageUrls[0] || 'https://via.placeholder.com/50'}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" />
        </td>
        <td style="padding: 10px;">${item.name}</td>
        <td style="padding: 10px; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right;">
          ${currency.toLowerCase() === 'gbp' ? '£' : '₦'}${(item.price * item.quantity).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: `Order Confirmation - #${orderId}`,
      text: `Thank you for your purchase! Your order #${orderId} is being processed. Total: ${currency.toUpperCase()}${total.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. View details: ${process.env.DOMAIN}/order-confirmation?orderId=${orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a73e8;">Thank You for Your Order! 🛒</h2>
          <p>Your order <strong>#${orderId}</strong> has been placed and is being processed.</p>
          <h3 style="color: #333;">Order Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f9f9f9;">
                <th style="padding: 10px; text-align: left;">Image</th>
                <th style="padding: 10px; text-align: left;">Product</th>
                <th style="padding: 10px; text-align: center;">Quantity</th>
                <th style="padding: 10px; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Total:</td>
                <td style="padding: 10px; text-align: right; font-weight: bold;">
                  ${currency.toLowerCase() === 'gbp' ? '£' : '₦'}${total.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
          <p style="margin-top: 20px;">
            View your order details: <a href="${process.env.DOMAIN}/order-confirmation?orderId=${orderId}" style="color: #1a73e8;">View Order</a>
          </p>
          <p>Contact <a href="mailto:support@foremade.com" style="color: #1a73e8;">support@foremade.com</a> for assistance.</p>
          <p>Thank you for shopping with Foremade!</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${email} for order ${orderId}`);
    res.json({ status: 'success', message: 'Order confirmation email sent' });
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
    res.status(500).json({ error: 'Failed to send order confirmation email', details: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});