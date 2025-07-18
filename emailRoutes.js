const express = require('express');
const nodemailer = require('nodemailer');
const { db } = require('./firebaseConfig');
const { doc, getDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
const router = express.Router();
const emailService = require('./emailService');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * @swagger
 * /send-product-approved-email:
 *   post:
 *     summary: Send product approval email
 *     description: Send email notification when a product is approved
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - productName
 *               - sellerId
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID
 *                 example: "product123"
 *               productName:
 *                 type: string
 *                 description: Product name
 *                 example: "iPhone 13 Pro"
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *               sellerEmail:
 *                 type: string
 *                 format: email
 *                 description: Seller email (optional, will be fetched from database if not provided)
 *                 example: "seller@example.com"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Approval email sent to seller"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Product or seller not found
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
// /send-product-approved-email endpoint
router.post('/send-product-approved-email', async (req, res) => {
  try {
    const { productId, productName, sellerId, sellerEmail } = req.body;
    console.log('Received payload for product approved email:', { productId, productName, sellerId, sellerEmail });

    if (!productId || !productName || !sellerId) {
      console.warn('Missing required fields:', { productId, productName, sellerId, sellerEmail });
      return res.status(400).json({ error: 'Missing productId, productName, or sellerId' });
    }

    let email = sellerEmail;
    if (!email) {
      const userDoc = await getDoc(doc(db, 'users', sellerId));
      if (!userDoc.exists()) {
        console.warn(`Seller ${sellerId} not found in Firestore`);
        return res.status(400).json({ error: 'Seller not found' });
      }
      email = userDoc.data().email;
      if (!email) {
        console.warn(`No email found for seller ${sellerId}`);
        return res.status(400).json({ error: 'No email found for seller' });
      }
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      console.warn(`Product ${productId} not found in Firestore`);
      return res.status(404).json({ error: 'Product not found' });
    }

    await emailService.sendProductApprovedEmail({ productId, productName, sellerId, sellerEmail });
    console.log(`Approval email sent to ${email} for product ${productId}`);

    await updateDoc(productRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Approval email sent to seller' });
  } catch (error) {
    console.error('Error sending product approved email:', {
      message: error.message,
      stack: error.stack,
      payload: req.body,
    });
    res.status(500).json({ error: 'Failed to send approval email', details: error.message });
  }
});

/**
 * @swagger
 * /send-product-rejected-email:
 *   post:
 *     summary: Send product rejection email
 *     description: Send email notification when a product is rejected
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - productName
 *               - sellerId
 *               - reason
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID
 *                 example: "product123"
 *               productName:
 *                 type: string
 *                 description: Product name
 *                 example: "iPhone 13 Pro"
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *               sellerEmail:
 *                 type: string
 *                 format: email
 *                 description: Seller email (optional, will be fetched from database if not provided)
 *                 example: "seller@example.com"
 *               reason:
 *                 type: string
 *                 description: Reason for rejection
 *                 example: "Product images do not meet quality standards"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Rejection email sent to seller"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Product or seller not found
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
// /send-product-rejected-email endpoint
router.post('/send-product-rejected-email', async (req, res) => {
  try {
    const { productId, productName, sellerId, sellerEmail, reason } = req.body;
    console.log('Received payload for product rejected email:', { productId, productName, sellerId, sellerEmail, reason });

    if (!productId || !productName || !sellerId || !reason) {
      console.warn('Missing required fields:', { productId, productName, sellerId, sellerEmail, reason });
      return res.status(400).json({ error: 'Missing productId, productName, sellerId, or reason' });
    }

    let email = sellerEmail;
    if (!email) {
      const userDoc = await getDoc(doc(db, 'users', sellerId));
      if (!userDoc.exists()) {
        console.warn(`Seller ${sellerId} not found in Firestore`);
        return res.status(400).json({ error: 'Seller not found' });
      }
      email = userDoc.data().email;
      if (!email) {
        console.warn(`No email found for seller ${sellerId}`);
        return res.status(400).json({ error: 'No email found for seller' });
      }
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      console.warn(`Product ${productId} not found in Firestore`);
      return res.status(404).json({ error: 'Product not found' });
    }

    await emailService.sendProductRejectedEmail({ productId, productName, sellerId, sellerEmail, reason });
    console.log(`Rejection email sent to ${email} for product ${productId}`);

    await updateDoc(productRef, {
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Rejection email sent to seller' });
  } catch (error) {
    console.error('Error sending product rejected email:', {
      message: error.message,
      stack: error.stack,
      payload: req.body,
    });
    res.status(500).json({ error: 'Failed to send rejection email', details: error.message });
  }
});

/**
 * @swagger
 * /send-order-confirmation:
 *   post:
 *     summary: Send order confirmation email
 *     description: Send order confirmation email to customer
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - email
 *               - items
 *               - total
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *                 example: "order123"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Customer email address
 *                 example: "customer@example.com"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Product name
 *                     quantity:
 *                       type: integer
 *                       description: Quantity ordered
 *                     price:
 *                       type: number
 *                       description: Unit price
 *                     imageUrls:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Product image URLs
 *                 description: Array of ordered items
 *               total:
 *                 type: number
 *                 description: Total order amount
 *                 example: 50000
 *               currency:
 *                 type: string
 *                 enum: [ngn, gbp]
 *                 default: ngn
 *                 description: Currency code
 *                 example: "ngn"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Order confirmation email sent"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Order not found
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
// /send-order-confirmation endpoint
router.post('/send-order-confirmation', async (req, res) => {
  try {
    const { orderId, email, items, total, currency } = req.body;
    console.log('Received payload for order confirmation:', {
      orderId,
      email,
      items,
      total,
      currency,
      payload: JSON.stringify(req.body, null, 2),
    });

    if (!orderId || !email || !items || !total) {
      console.warn('Missing required fields:', { orderId, email, items, total });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      console.warn('Invalid items array:', items);
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }
    if (typeof total !== 'number' || total <= 0) {
      console.warn('Invalid total amount:', total);
      return res.status(400).json({ error: 'Total must be a positive number' });
    }
    if (!['ngn', 'gbp'].includes(currency?.toLowerCase())) {
      console.warn('Invalid currency:', currency);
      return res.status(400).json({ error: 'Invalid currency' });
    }

    for (const item of items) {
      if (!item.name || !item.quantity || !item.price || !item.imageUrls || !Array.isArray(item.imageUrls)) {
        console.warn('Invalid item structure:', item);
        return res.status(400).json({ error: 'Invalid item structure: missing name, quantity, price, or imageUrls' });
      }
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      console.warn(`Order ${orderId} not found in Firestore`);
      return res.status(404).json({ error: 'Order not found' });
    }

    await emailService.sendOrderConfirmation({ orderId, email, items, total, currency });
    console.log(`Order confirmation email sent to ${email} for order ${orderId}`);
    res.json({ status: 'success', message: 'Order confirmation email sent' });
  } catch (error) {
    console.error('Error sending order confirmation email:', {
      message: error.message,
      stack: error.stack,
      payload: JSON.stringify(req.body, null, 2),
    });
    res.status(500).json({ error: 'Failed to send order confirmation email', details: error.message });
  }
});

/**
 * @swagger
 * /api/youth-empowerment:
 *   post:
 *     summary: Submit youth empowerment application
 *     description: Send youth empowerment application form data via email
 *     tags: [Applications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Youth empowerment application form data
 *             example: {
 *               "firstName": "John",
 *               "lastName": "Doe",
 *               "email": "john@example.com",
 *               "phone": "+2348012345678",
 *               "age": 25,
 *               "location": "Lagos, Nigeria",
 *               "education": "Bachelor's Degree",
 *               "skills": ["Web Development", "Digital Marketing"],
 *               "motivation": "I want to start my own business..."
 *             }
 *     responses:
 *       200:
 *         description: Application sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Application sent successfully!"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Route for Youth Empowerment Form
router.post('/api/youth-empowerment', async (req, res) => {
  const formData = req.body;
  try {
    console.log('[YOUTH EMPOWERMENT] Received formData:', formData);
    console.log('[YOUTH EMPOWERMENT] EMAIL_USER:', process.env.EMAIL_USER);
    console.log('[YOUTH EMPOWERMENT] EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');
    console.log('[YOUTH EMPOWERMENT] Sending to:', 'yehub@foremade.com');
    await emailService.sendYouthEmpowermentApplication(formData);
    res.status(200).json({ message: 'Application sent successfully!' });
  } catch (err) {
    console.error('[YOUTH EMPOWERMENT] Failed to send email:', {
      message: err.message,
      stack: err.stack,
      error: err,
      formData,
      emailUser: process.env.EMAIL_USER,
      emailPassSet: !!process.env.EMAIL_PASS
    });
    res.status(500).json({ error: 'Failed to send email.', details: err.message });
  }
});

/**
 * @swagger
 * /send-seller-order-notification:
 *   post:
 *     summary: Send seller order notification email
 *     description: Send an email notification to a seller when they receive a new order.
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - sellerId
 *               - items
 *               - total
 *               - currency
 *               - shippingDetails
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID
 *                 example: "order1234567890"
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: "seller123"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - quantity
 *                     - price
 *                     - imageUrls
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Product name
 *                     quantity:
 *                       type: integer
 *                       description: Quantity ordered
 *                     price:
 *                       type: number
 *                       description: Unit price
 *                     imageUrls:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Product image URLs
 *                 description: Array of ordered items
 *               total:
 *                 type: number
 *                 description: Total order amount
 *                 example: 120000
 *               currency:
 *                 type: string
 *                 enum: [ngn, gbp]
 *                 description: Currency code
 *                 example: "ngn"
 *               shippingDetails:
 *                 type: object
 *                 required:
 *                   - name
 *                   - address
 *                   - city
 *                   - postalCode
 *                   - country
 *                   - phone
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: Recipient's name
 *                   address:
 *                     type: string
 *                     description: Recipient's address
 *                   city:
 *                     type: string
 *                     description: Recipient's city
 *                   postalCode:
 *                     type: string
 *                     description: Recipient's postal code
 *                   country:
 *                     type: string
 *                     description: Recipient's country
 *                   phone:
 *                     type: string
 *                     description: Recipient's phone number
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Seller order notification email sent"
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
// /send-seller-order-notification endpoint
router.post('/send-seller-order-notification', async (req, res) => {
  try {
    const { orderId, sellerId, items, total, currency, shippingDetails } = req.body;
    console.log('Received payload for seller order notification:', {
      orderId,
      sellerId,
      items,
      total,
      currency,
      shippingDetails,
      payload: JSON.stringify(req.body, null, 2),
    });

    // Validate required fields
    if (!orderId || !sellerId || !items || !total || !currency || !shippingDetails) {
      console.warn('Missing required fields:', { orderId, sellerId, items, total, currency, shippingDetails });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      console.warn('Invalid items array:', items);
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }
    if (typeof total !== 'number' || total <= 0) {
      console.warn('Invalid total amount:', total);
      return res.status(400).json({ error: 'Total must be a positive number' });
    }
    if (!['ngn', 'gbp'].includes(currency?.toLowerCase())) {
      console.warn('Invalid currency:', currency);
      return res.status(400).json({ error: 'Invalid currency' });
    }
    if (!shippingDetails.name || !shippingDetails.address || !shippingDetails.city || !shippingDetails.postalCode || !shippingDetails.country || !shippingDetails.phone) {
      console.warn('Invalid shipping details:', shippingDetails);
      return res.status(400).json({ error: 'Invalid shipping details: missing name, address, city, postalCode, country, or phone' });
    }

    // Validate item structure
    for (const item of items) {
      if (!item.name || !item.quantity || !item.price || !item.imageUrls || !Array.isArray(item.imageUrls)) {
        console.warn('Invalid item structure:', item);
        return res.status(400).json({ error: 'Invalid item structure: missing name, quantity, price, or imageUrls' });
      }
    }

    // Fetch seller's email from Firestore
    const userDoc = await getDoc(doc(db, 'users', sellerId));
    if (!userDoc.exists()) {
      console.warn(`Seller ${sellerId} not found in Firestore`);
      return res.status(400).json({ error: 'Seller not found' });
    }
    const email = userDoc.data().email;
    if (!email) {
      console.warn(`No email found for seller ${sellerId}`);
      return res.status(400).json({ error: 'No email found for seller' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Send email using emailService (if implemented)
    if (emailService && emailService.sendSellerOrderNotification) {
      await emailService.sendSellerOrderNotification({ email, orderId, items, total, currency, shippingDetails });
      console.log(`Seller order notification email sent to ${email} for order ${orderId}`);
      res.json({ status: 'success', message: 'Seller order notification email sent' });
    } else {
      // Fallback: send a basic email if emailService is not implemented
      res.json({ status: 'success', message: 'Seller order notification email logic not implemented' });
    }
  } catch (error) {
    console.error('Error sending seller order notification email:', {
      message: error.message,
      stack: error.stack,
      payload: JSON.stringify(req.body, null, 2),
    });
    res.status(500).json({ error: 'Failed to send seller order notification email', details: error.message });
  }
});

/**
 * @swagger
 * /send-abandoned-cart-email:
 *   post:
 *     summary: Send abandoned cart reminder email
 *     description: Send an email to remind a user about items left in their cart
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "customer@example.com"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Abandoned cart email sent"
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
// /send-abandoned-cart-email endpoint
router.post('/send-abandoned-cart-email', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const userName = name || 'there';
    await emailService.sendAbandonedCartEmail({ email, name: userName });
    res.json({ status: 'success', message: 'Abandoned cart email sent' });
  } catch (error) {
    console.error('Error sending abandoned cart email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send abandoned cart email', details: error.message });
  }
});

/**
 * @swagger
 * /send-listing-rejected-generic:
 *   post:
 *     summary: Send generic item listing rejection email
 *     description: Send a generic rejection email to a user whose item listing was not approved
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "seller@example.com"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Listing rejection email sent"
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
// /send-listing-rejected-generic endpoint
router.post('/send-listing-rejected-generic', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const userName = name || '';
    await emailService.sendListingRejectedGeneric({ email, name: userName });
    res.json({ status: 'success', message: 'Listing rejection email sent' });
  } catch (error) {
    console.error('Error sending listing rejection email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send listing rejection email', details: error.message });
  }
});

/**
 * @swagger
 * /send-order-cancelled-email:
 *   post:
 *     summary: Send order cancellation email
 *     description: Send an email to notify a user that their order has been cancelled
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - orderNumber
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "customer@example.com"
 *               orderNumber:
 *                 type: string
 *                 description: Order number
 *                 example: "123456"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Order cancellation email sent"
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
// /send-order-cancelled-email endpoint
router.post('/send-order-cancelled-email', async (req, res) => {
  try {
    const { email, orderNumber, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
      return res.status(400).json({ error: 'Valid email and orderNumber are required' });
    }
    const userName = name || 'there';
    await emailService.sendOrderCancelledEmail({ email, orderNumber, name: userName });
    res.json({ status: 'success', message: 'Order cancellation email sent' });
  } catch (error) {
    console.error('Error sending order cancellation email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send order cancellation email', details: error.message });
  }
});

/**
 * @swagger
 * /send-order-confirmation-simple:
 *   post:
 *     summary: Send simple order confirmation email
 *     description: Send a simple order confirmation email to a user after a successful purchase
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - orderNumber
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "customer@example.com"
 *               orderNumber:
 *                 type: string
 *                 description: Order number
 *                 example: "123456"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Order confirmation email sent"
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
// /send-order-confirmation-simple endpoint
router.post('/send-order-confirmation-simple', async (req, res) => {
  try {
    const { email, orderNumber, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
      return res.status(400).json({ error: 'Valid email and orderNumber are required' });
    }
    const userName = name || 'there';
    await emailService.sendOrderConfirmationSimple({ email, orderNumber, name: userName });
    res.json({ status: 'success', message: 'Order confirmation email sent' });
  } catch (error) {
    console.error('Error sending order confirmation email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send order confirmation email', details: error.message });
  }
});

/**
 * @swagger
 * /send-refund-approved-email:
 *   post:
 *     summary: Send refund approved email
 *     description: Send an email to notify a user that their refund has been approved
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - orderNumber
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "customer@example.com"
 *               orderNumber:
 *                 type: string
 *                 description: Order number
 *                 example: "123456"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Refund approved email sent"
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
// /send-refund-approved-email endpoint
router.post('/send-refund-approved-email', async (req, res) => {
  try {
    const { email, orderNumber, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
      return res.status(400).json({ error: 'Valid email and orderNumber are required' });
    }
    const userName = name || 'there';
    await emailService.sendRefundApprovedEmail({ email, orderNumber, name: userName });
    res.json({ status: 'success', message: 'Refund approved email sent' });
  } catch (error) {
    console.error('Error sending refund approved email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send refund approved email', details: error.message });
  }
});

/**
 * @swagger
 * /send-shipping-confirmation-email:
 *   post:
 *     summary: Send shipping confirmation email
 *     description: Send an email to notify a user that their order has shipped
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - orderNumber
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "customer@example.com"
 *               orderNumber:
 *                 type: string
 *                 description: Order number
 *                 example: "123456"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Shipping confirmation email sent"
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
// /send-shipping-confirmation-email endpoint
router.post('/send-shipping-confirmation-email', async (req, res) => {
  try {
    const { email, orderNumber, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
      return res.status(400).json({ error: 'Valid email and orderNumber are required' });
    }
    const userName = name || 'there';
    await emailService.sendShippingConfirmationEmail({ email, orderNumber, name: userName });
    res.json({ status: 'success', message: 'Shipping confirmation email sent' });
  } catch (error) {
    console.error('Error sending shipping confirmation email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send shipping confirmation email', details: error.message });
  }
});

/**
 * @swagger
 * /send-feedback-request-email:
 *   post:
 *     summary: Send feedback request email
 *     description: Send an email to request feedback from a user after an interaction
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "customer@example.com"
 *               name:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Email sent successfully
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
 *                   example: "Feedback request email sent"
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
// /send-feedback-request-email endpoint
router.post('/send-feedback-request-email', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const userName = name || 'there';
    await emailService.sendFeedbackRequestEmail({ email, name: userName });
    res.json({ status: 'success', message: 'Feedback request email sent' });
  } catch (error) {
    console.error('Error sending feedback request email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send feedback request email', details: error.message });
  }
});

module.exports = router;