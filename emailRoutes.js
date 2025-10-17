const express = require('express');
const { db } = require('./firebaseConfig');
const { collection, doc, setDoc, getDocs, getDoc, updateDoc, query, where, serverTimestamp } = require('firebase/firestore');
const router = express.Router();
const crypto = require('crypto');
const emailService = require('./emailService');

// Remove redundant nodemailer transporter since emailService handles it

// Log initialization to debug
console.log('emailRoutes initialized. Firestore db:', db ? 'Available' : 'Not available');
console.log('crypto module:', crypto ? 'Available' : 'Not available');

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
        return res.status(404).json({ error: 'Seller not found' });
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
    const productData = productSnap.data();
    if (productData.approvalEmailSent) {
      console.log(`Approval email already sent to ${email} for product ${productId}`);
      return res.json({ status: 'success', message: 'Approval email already sent to seller' });
    }

    await emailService.sendProductApprovedEmail({ email, productId, productName, sellerId });
    console.log(`Approval email sent to ${email} for product ${productId}`);

    await updateDoc(productRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Approval email sent to seller' });
  } catch (error) {
    console.error('Error in send-product-approved-email endpoint:', {
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
        return res.status(404).json({ error: 'Seller not found' });
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
    const productData = productSnap.data();
    if (productData.rejectionEmailSent) {
      console.log(`Rejection email already sent to ${email} for product ${productId}`);
      return res.json({ status: 'success', message: 'Rejection email already sent to seller' });
    }

    await emailService.sendProductRejectedEmail({ email, productId, productName, sellerId, reason });
    console.log(`Rejection email sent to ${email} for product ${productId}`);

    await updateDoc(productRef, {
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Rejection email sent to seller' });
  } catch (error) {
    console.error('Error in send-product-rejected-email endpoint:', {
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
    const orderData = orderSnap.data();
    if (orderData.confirmationEmailSent) {
      console.log(`Order confirmation email already sent to ${email} for order ${orderId}`);
      return res.json({ status: 'success', message: 'Order confirmation email already sent' });
    }

    await emailService.sendOrderConfirmationSimpleEmail({ email, orderNumber: orderId, items, total });
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
router.post('/api/youth-empowerment', async (req, res) => {
  const formData = req.body;
  try {
    console.log('[YOUTH EMPOWERMENT] Received formData:', formData);
    await emailService.sendYouthEmpowermentApplication(formData);
    res.json({ message: 'Application sent successfully!' });
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

    if (!orderId || !sellerId || !items || !total || !currency || !shippingDetails) {
      console.warn('Missing required fields:', { orderId, sellerId, items, total, currency, shippingDetails });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^\d{12}$/.test(orderId)) {
      console.warn('Invalid orderId format:', orderId);
      return res.status(400).json({ error: 'Order ID must be a 12-digit numeric string' });
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
    for (const item of items) {
      if (!item.name || !item.quantity || !item.price || !item.imageUrls || !Array.isArray(item.imageUrls)) {
        console.warn('Invalid item structure:', item);
        return res.status(400).json({ error: 'Invalid item structure: missing name, quantity, price, or imageUrls' });
      }
    }

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

    await emailService.sendSellerOrderNotification({ email, orderId, items, total, currency, shippingDetails });

    res.status(200).json({ status: 'success', message: 'Order notification emails sent to seller, admin, and logistics' });
  } catch (error) {
    console.error('Error sending order notification emails:', {
      message: error.message,
      stack: error.stack,
      payload: JSON.stringify(req.body, null, 2),
    });
    res.status(500).json({ error: 'Failed to send order notification emails', details: error.message });
  }
});

// API endpoint to send inactive user email
router.post('/send-inactive-email', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      console.warn('Invalid request data:', { email });
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Send email without duplicate checking
    await emailService.sendInactiveUserReminder({ email, name });

    console.log(`Inactive email sent to ${email}`);
    res.status(200).json({ status: 'success', message: 'Inactive user email sent' });
  } catch (error) {
    console.error('Error sending inactive email:', error.message);
    res.status(500).json({ error: 'Failed to send inactive email', details: error.message });
  }
});

module.exports = router;

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
router.post('/send-listing-rejected-generic', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const userName = name || '';
    await emailService.sendListingRejectedGenericEmail({ email, name: userName });
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
router.post('/send-order-confirmation-simple', async (req, res) => {
  try {
    const { email, orderNumber, name } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
      return res.status(400).json({ error: 'Valid email and orderNumber are required' });
    }
    const userName = name || 'there';
    await emailService.sendOrderConfirmationSimpleEmail({ email, orderNumber, name: userName });
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

/**
 * @swagger
 * /send-email-verification:
 *   post:
 *     summary: Send email verification email
 *     description: Send an email to verify a user's email address
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - verificationLink
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "user@example.com"
 *               verificationLink:
 *                 type: string
 *                 description: Verification URL
 *                 example: "https://foremade.com/verify?token=abc123"
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
 *                   example: "Verification email sent"
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
router.post('/send-email-verification', async (req, res) => {
  try {
    const { email, verificationLink } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !verificationLink) {
      return res.status(400).json({ error: 'Valid email and verificationLink are required' });
    }
    await emailService.sendEmailVerification({ email, verificationLink });
    res.json({ status: 'success', message: 'Verification email sent' });
  } catch (error) {
    console.error('Error sending email verification:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send verification email', details: error.message });
  }
});

/**
 * @swagger
 * /send-pro-seller-request-received:
 *   post:
 *     summary: Send pro seller request received email
 *     description: Send an email confirming receipt of a pro seller application
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
 *                   example: "Pro seller request received email sent"
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
router.post('/send-pro-seller-request-received', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    await emailService.sendProSellerRequestReceived({ email });
    res.json({ status: 'success', message: 'Pro seller request received email sent' });
  } catch (error) {
    console.error('Error sending pro seller request received email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send pro seller request received email', details: error.message });
  }
});

/**
 * @swagger
 * /send-product-bump-receipt:
 *   post:
 *     summary: Send product bump receipt email
 *     description: Send an email with the product bump receipt details
 *     tags: [Email Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - duration
 *               - amount
 *               - startTime
 *               - endTime
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "seller@example.com"
 *               duration:
 *                 type: string
 *                 description: Bump duration
 *                 example: "7 Days"
 *               amount:
 *                 type: string
 *                 description: Amount paid
 *                 example: "₦3,500"
 *               startTime:
 *                 type: string
 *                 description: Start time of bump
 *                 example: "Thursday, 31 July 2025 at 10:03 PM"
 *               endTime:
 *                 type: string
 *                 description: End time of bump
 *                 example: "Thursday, 07 August 2025 at 10:03 PM"
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
 *                   example: "Product bump receipt email sent"
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
router.post('/api/send-bump-email', async (req, res) => {
  try {
    const { email, duration, amount, startTime, endTime } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !duration || !amount || !startTime || !endTime) {
      return res.status(400).json({ error: 'Valid email, duration, amount, startTime, and endTime are required' });
    }
    await emailService.sendProductBumpReceipt({ email, duration, amount, startTime, endTime });
    res.json({ status: 'success', message: 'Product bump receipt email sent' });
  } catch (error) {
    console.error('Error sending product bump receipt email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send product bump receipt email', details: error.message });
  }
});

router.post('/api/send-message-email', async (req, res) => {
  try {
    const { email, duration, amount, startTime, endTime } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email) || !duration || !amount || !startTime || !endTime) {
      return res.status(400).json({ error: 'Valid email, duration, amount, startTime, and endTime are required' });
    }
    await emailService.sendProductBumpReceipt({ email, duration, amount, startTime, endTime });
    res.json({ status: 'success', message: 'Product bump receipt email sent' });
  } catch (error) {
    console.error('Error sending product bump receipt email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send product bump receipt email', details: error.message });
  }
});

/**
 * @swagger
 * /send-membership-revoked-email:
 *   post:
 *     summary: Send membership revoked email
 *     description: Send an email notifying a user of membership revocation
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
 *                 example: "user@example.com"
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
 *                   example: "Membership revoked email sent"
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
router.post('/send-membership-revoked-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    await emailService.sendMembershipRevokedEmail({ email });
    res.json({ status: 'success', message: 'Membership revoked email sent' });
  } catch (error) {
    console.error('Error sending membership revoked email:', { message: error.message, stack: error.stack, payload: req.body });
    res.status(500).json({ error: 'Failed to send membership revoked email', details: error.message });
  }
});

// Endpoint to request a password reset link
/**
 * @swagger
 * /api/request-password-reset:
 *   post:
 *     summary: Request a password reset link
 *     description: Sends a password reset link to the user's email if the email exists in Firestore.
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
 *                 description: The user's email address
 *     responses:
 *       200:
 *         description: Password reset link sent successfully
 *       400:
 *         description: Invalid email or user not found
 *       500:
 *         description: Server error
 */
router.post('/request-password-reset', async (req, res) => {
  console.log('Request password reset:', JSON.stringify(req.body, null, 2));
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }

  try {
    // Check if user exists in Firestore
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const userSnapshot = await getDocs(q);
    if (userSnapshot.empty) {
      return res.status(400).json({ success: false, error: 'No user found with this email' });
    }

    const userDoc = userSnapshot.docs[0];
    const userId = userDoc.id;

    // Generate a reset token
    if (!crypto.randomBytes) {
      throw new Error('crypto.randomBytes is not available');
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 3600000; // 1 hour expiry

    // Store token in Firestore
    const tokenRef = doc(db, 'passwordResetTokens', userId);
    await setDoc(tokenRef, {
      email,
      resetToken,
      expiry: tokenExpiry,
      used: false,
      createdAt: serverTimestamp(),
    });
    console.log('Password reset token stored:', { email, resetToken, expiry: tokenExpiry });

    // Send reset email
    await emailService.sendPasswordResetEmail({ email, resetToken });
    console.log('Password reset email sent successfully for email:', email);
    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (error) {
    console.error('Error in request-password-reset:', error.message || error);
    res.status(500).json({ success: false, error: `Failed to send password reset link: ${error.message}` });
  }
});

// Endpoint to reset password
/**
 * @swagger
 * /api/reset-password:
 *   post:
 *     summary: Reset user password
 *     description: Verifies the reset token and updates the user's password in Firestore.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - token
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The user's email address
 *               token:
 *                 type: string
 *                 description: The password reset token
 *               newPassword:
 *                 type: string
 *                 description: The new password (minimum 8 characters)
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid token, expired token, or invalid password
 *       500:
 *         description: Server error
 */
router.post('/reset-password', async (req, res) => {
  console.log('Reset password request:', JSON.stringify(req.body, null, 2));
  const { email, token, newPassword } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }
  if (!token) {
    return res.status(400).json({ success: false, error: 'Reset token is required' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
  }

  try {
    // Verify token in Firestore
    const tokensRef = collection(db, 'passwordResetTokens');
    const q = query(tokensRef, where('email', '==', email), where('resetToken', '==', token), where('used', '==', false));
    const tokenSnapshot = await getDocs(q);

    if (tokenSnapshot.empty) {
      return res.status(400).json({ success: false, error: 'Invalid or used token' });
    }

    const tokenDoc = tokenSnapshot.docs[0];
    const tokenData = tokenDoc.data();

    if (tokenData.expiry < Date.now()) {
      return res.status(400).json({ success: false, error: 'Token has expired' });
    }

    // Find user
    const usersRef = collection(db, 'users');
    const userQuery = query(usersRef, where('email', '==', email));
    const userSnapshot = await getDocs(userQuery);
    if (userSnapshot.empty) {
      return res.status(400).json({ success: false, error: 'No user found with this email' });
    }

    const userDoc = userSnapshot.docs[0];

    // Update user password
    await updateDoc(doc(db, 'users', userDoc.id), {
      password: newPassword,
      updatedAt: serverTimestamp(),
    });

    // Mark token as used
    await updateDoc(doc(db, 'passwordResetTokens', tokenDoc.id), {
      used: true,
      usedAt: serverTimestamp(),
    });

    console.log('Password reset successfully for email:', email);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in reset-password:', error.message || error);
    res.status(500).json({ success: false, error: `Failed to reset password: ${error.message}` });
  }
});

module.exports = router;
