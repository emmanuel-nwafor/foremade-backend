const express = require('express');
const nodemailer = require('nodemailer');
const { db } = require('./firebaseConfig');
const { doc, getDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
const router = express.Router();

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

    const mailOptions = {
      from: `"Your Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: 'Your Product is Live on Foremade! 🎉',
      text: `Great news! Your product "${productName}" (ID: ${productId}) has been approved and is now live on Foremade. Log in to your seller dashboard to manage your listings: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a73e8;">Great news! Your Product is Live! 🎉</h2>
          <p>We're excited to inform you that your product <strong>"${productName}"</strong> (ID: ${productId}) has been approved by our team and is now live on Foremade!</p>
          <p>Customers can now view and purchase your product on our platform. To manage your listings or view performance, visit your seller dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Seller Dashboard</a>
          <p>Thank you for choosing Foremade. Let's make those sales soar!</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly. For support, contact us at <a href="mailto:support@foremade.com">support@foremade.com</a>.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
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

    const mailOptions = {
      from: `"Your Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: 'Update: Your Product Was Not Approved on Foremade',
      text: `Dear Seller, we're sorry to inform you that your product "${productName}" (ID: ${productId}) was not approved for listing on Foremade. Reason: ${reason}. Please review our guidelines and resubmit or contact support for more details: https://foremade.com/support. Log in to your seller dashboard to update your product: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">Update: Your Product Was Not Approved</h2>
          <p>Dear Seller,</p>
          <p>We're sorry to inform you that your product "<strong>${productName}</strong>" (ID: ${productId}) was not approved for listing on Foremade after our team's review.</p>
          <p><strong>Reason for Rejection:</strong> ${reason}</p>
          <p>Please review our <a href="https://foremade.com/guidelines" style="color: #1a73e8;">seller guidelines</a> to ensure your product meets our standards. You can update and resubmit your product via your seller dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Seller Dashboard</a>
          <p>For further assistance, contact our support team at <a href="mailto:support@foremade.com" style="color: #1a73e8;">support@foremade.com</a>.</p>
          <p>Thank you for being part of Foremade!</p>
          <p>Best regards,<br>The Foremade Team</p>
          <hr style="border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888;">This is an automated email. Please do not reply directly.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
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

    const itemRows = items.map((item) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px;">
          <img src="${item.imageUrls[0] || 'https://via.placeholder.com/50'}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" />
        </td>
        <td style="padding: 10px;">
          ${item.name}
        </td>
        <td style="padding: 10px; text-align: center;">
          ${item.quantity}
        </td>
        <td style="padding: 10px; text-align: right;">
          ${currency.toLowerCase() === 'gbp' ? '£' : '₦'}${(item.price * item.quantity).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"Foremade Team" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: `Order Confirmation - #${orderId}`,
      text: `Thank you for your purchase on Foremade! Your order #${orderId} has been received and is being processed. Total: ${currency.toUpperCase()}${total.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. View your order details: ${process.env.DOMAIN}/order-confirmation?orderId=${orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a73e8;">Order Confirmation - #${orderId}</h2>
          <p>Thank you for shopping with Foremade! 🛒</p>
          <p>Your order has been successfully placed and is being processed. Below are the details of your order:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f5f5f5;">
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
          <p>You can view your order details and track its status here:</p>
          <a href="${process.env.DOMAIN}/order-confirmation?orderId=${orderId}" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">View Order Details</a>
          <p>Need help? Contact our support team at <a href="mailto:support@foremade.com" style="color: #1a73e8;">support@foremade.com</a>.</p>
          <p>Thank you for choosing Foremade!</p>
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
    await transporter.sendMail({
      from: `"Foremade" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: 'yehub@foremade.com', // Updated target email
      subject: 'New Youth Empowerment Application',
      text: JSON.stringify(formData, null, 2),
      html: `<pre>${JSON.stringify(formData, null, 2)}</pre>`,
    });
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

module.exports = router;