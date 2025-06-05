const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.get('/', (req, res) => {
  res.send('Backend Server is Running');
});

// Log environment variables to confirm they are loaded
console.log('Environment Variables Check:');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Loaded' : 'Missing');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Loaded' : 'Missing');
console.log('ADMIN_STRIPE_ACCOUNT_ID:', process.env.ADMIN_STRIPE_ACCOUNT_ID ? 'Loaded' : 'Missing');
console.log('ADMIN_PAYSTACK_RECIPIENT_CODE:', process.env.ADMIN_PAYSTACK_RECIPIENT_CODE ? 'Loaded' : 'Missing');

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, metadata } = req.body;

    if (!amount || !currency || !metadata) {
      return res.status(400).json({ error: 'Missing required fields: amount, currency, or metadata' });
    }

    const { handlingFee, buyerProtectionFee } = metadata;
    const adminFee = (parseFloat(handlingFee) + parseFloat(buyerProtectionFee)) * 100; // Convert to cents/kobo

    if (!process.env.ADMIN_STRIPE_ACCOUNT_ID) {
      return res.status(500).json({ error: 'Admin Stripe account ID not configured' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: currency.toLowerCase(),
      payment_method_types: ['card'],
      metadata,
      application_fee_amount: Math.round(adminFee),
      transfer_data: {
        destination: process.env.ADMIN_STRIPE_ACCOUNT_ID,
      },
    });

    console.log('Stripe Payment Intent Created:', {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      applicationFee: adminFee,
      destination: process.env.ADMIN_STRIPE_ACCOUNT_ID,
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Stripe Payment Intent Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(500).json({ error: error.message });
  }
});

app.post('/initiate-paystack-payment', async (req, res) => {
  try {
    const { email, amount, metadata } = req.body;

    if (!email || !amount || !metadata) {
      return res.status(400).json({ error: 'Missing required fields: email, amount, or metadata' });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Paystack secret key not configured' });
    }

    if (!process.env.ADMIN_PAYSTACK_RECIPIENT_CODE) {
      return res.status(500).json({ error: 'Admin Paystack recipient code not configured' });
    }

    const { handlingFee, buyerProtectionFee } = metadata;
    const adminFee = (parseFloat(handlingFee) + parseFloat(buyerProtectionFee)) * 100; // Convert to kobo

    // Initialize payment
    const paymentResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      { email, amount: Math.round(amount), metadata },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('Paystack API Response:', paymentResponse.data);

    // Note: Paystack requires a webhook to confirm payment success before initiating a transfer
    // For simplicity, we'll return the authorization URL and handle the transfer in a webhook
    // In production, set up a webhook endpoint to verify the payment and initiate the transfer

    res.json(paymentResponse.data);
  } catch (error) {
    console.error('Paystack Payment Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
    });
    res.status(500).json({ error: error.message });
  }
});

// Add a webhook endpoint for Paystack to handle payment verification and transfer
app.post('/webhook/paystack', async (req, res) => {
  try {
    const event = req.body;

    // Verify the webhook signature (recommended in production)
    // For simplicity, we're skipping signature verification here

    if (event.event === 'charge.success') {
      const { metadata, amount, reference } = event.data;
      const { handlingFee, buyerProtectionFee } = metadata;
      const adminFee = (parseFloat(handlingFee) + parseFloat(buyerProtectionFee)) * 100; // Convert to kobo

      if (!process.env.ADMIN_PAYSTACK_RECIPIENT_CODE) {
        console.error('Admin Paystack recipient code not configured');
        return res.status(500).json({ error: 'Admin Paystack recipient code not configured' });
      }

      // Initiate transfer for admin fees
      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.round(adminFee),
          recipient: process.env.ADMIN_PAYSTACK_RECIPIENT_CODE,
          reason: `Admin fees for order ${metadata.orderId}`,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      console.log(`Automated transfer of admin fees ${adminFee} NGN to admin:`, transferResponse.data);
    }

    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Paystack Webhook Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
    });
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-order-confirmation', async (req, res) => {
  try {
    const { to, orderId, items, total, currency, shippingDetails, paymentGateway, date } = req.body;

    if (!to || !orderId || !items || !total || !currency || !shippingDetails || !paymentGateway || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: `Order Confirmation - ${orderId}`,
      html: `
        <h2>Order Confirmation</h2>
        <p>Thank you for your order!</p>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Date:</strong> ${date}</p>
        <h3>Items:</h3>
        <ul>
          ${items.map(item => `<li>${item.name} (x${item.quantity}) - ${currency} ${item.price}</li>`).join('')}
        </ul>
        <p><strong>Total:</strong> ${currency} ${total}</p>
        <h3>Shipping Details:</h3>
        <p><strong>Name:</strong> ${shippingDetails.name}</p>
        <p><strong>Address:</strong> ${shippingDetails.address}, ${shippingDetails.city}, ${shippingDetails.postalCode}, ${shippingDetails.country}</p>
        <p><strong>Phone:</strong> ${shippingDetails.phone}</p>
        <p><strong>Payment Method:</strong> ${paymentGateway}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${to} for order ${orderId}`);
    res.status(200).json({ message: 'Order confirmation email sent successfully' });
  } catch (error) {
    console.error('Email Sending Error:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Failed to send order confirmation email' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});