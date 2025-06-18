const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { upload } = require('../middleware/upload');
const { doc, getDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// /upload
router.post('/upload', upload.single('file'), async (req, res) => {
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

// /send-product-approved-email
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
      from: `"Foremade Support" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: 'Your Product is Live on Foremade! 🎉',
      text: `Great news! Your product "${productName}" (ID: ${productId}) has been approved and is now live on Foremade. Log in to your seller dashboard to manage your listings: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a73e8;">Great news! Your Product is Live! 🎉</h2>
          <p>We’re excited to inform you that your product <strong>"${productName}"</strong> (ID: ${productId}) has been approved by our team and is now live on Foremade!</p>
          <p>Customers can now view and purchase your product on our platform. To manage your listings or view performance, visit your seller dashboard:</p>
          <a href="${process.env.DOMAIN}/seller-dashboard" style="display: inline-block; padding: 10px 20px; background-color: #1a73e8; color: white; text-decoration: none; border-radius: 5px;">Go to Seller Dashboard</a>
          <p>Thank you for choosing Foremade. Let’s make those sales soar!</p>
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

// /send-product-rejected-email
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
      from: `"Foremade Support" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
      to: email,
      subject: 'Update: Your Product Was Not Approved on Foremade',
      text: `Dear Seller, we're sorry to inform you that your product "${productName}" (ID: ${productId}) was not approved for listing on Foremade. Reason: ${reason}. Please review our guidelines and resubmit or contact support for more details: https://foremade.com/support. Log in to your seller dashboard to update your product: ${process.env.DOMAIN}/seller-dashboard`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">Update: Your Product Was Not Approved</h2>
          <p>Dear Seller,</p>
          <p>We’re sorry to inform you that your product "<strong>${productName}</strong>" (ID: ${productId}) was not approved for listing on Foremade after our team’s review.</p>
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

module.exports = router;