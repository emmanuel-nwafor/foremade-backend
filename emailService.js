const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // Example: Use a specific service like 'gmail'. Adjust as needed.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  logger: true,
  debug: true, // Enable debug output
}).on('error', (error) => {
  console.error('Email Transport Error:', error.message);
  if (error.code === 'EAUTH') {
    console.error('Authentication failed. Check EMAIL_USER and EMAIL_PASS environment variables.');
  } else if (error.code === 'ECONNREFUSED') {
    console.error('Connection refused. Check your email service settings or network.');
  }
});

async function sendShippingConfirmationEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Order is on the Way - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Your Order is on the Way - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.order-number { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Shipping Confirmation</h2></div><div class="content"><h1>Your Order is on the Way!</h1><p>Hi ${userName},</p><p>Great news! Your order <span class="order-number">#${orderNumber}</span> has been shipped and is on its way to you.</p><p>Estimated delivery: <strong>3–5 business days</strong><br>You can track your shipment using the button below:</p><a href="https://foremade.com/track-order" class="button">Track Your Order</a><p style="margin-top: 40px;">Thank you for shopping with FOREMADE.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you made a purchase at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendRefundApprovedEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Refund Has Been Approved - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Refund Approved - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.order-number { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Refund Approval</h2></div><div class="content"><h1>Your Refund is Approved!</h1><p>Hi ${userName},</p><p>We’re pleased to inform you that your refund for order <span class="order-number">#${orderNumber}</span> has been approved.</p><p>The refund will be processed within 5-7 business days and credited to your original payment method.</p><p>For any questions, feel free to reach out:</p><a href="https://foremade.com/support" class="button">Contact Support</a><p style="margin-top: 40px;">Thank you for choosing FOREMADE.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you requested a refund at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendOrderCancelledEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Order Has Been Cancelled - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Order Cancelled - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.order-number { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Order Cancellation</h2></div><div class="content"><h1>Your Order Has Been Cancelled</h1><p>Hi ${userName},</p><p>We regret to inform you that your order <span class="order-number">#${orderNumber}</span> has been cancelled.</p><p>If this was unintentional, please contact us immediately to resolve the issue:</p><a href="https://foremade.com/support" class="button">Contact Support</a><p style="margin-top: 40px;">Thank you for your understanding.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because your order was cancelled at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendOrderConfirmationSimpleEmail({ email, orderNumber, name, items, total }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber || !items || !total) {
    throw new Error('Valid email, orderNumber, items, and total are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Thanks for Your Order - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - Order Confirmation</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .items { text-align: left; margin-bottom: 20px; }
    .items div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ccc; }
    .payment { text-align: left; margin-bottom: 20px; }
    .payment p { margin: 5px 0; }
    .faq { text-align: left; margin-bottom: 20px; }
    .faq div { margin-bottom: 10px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>Thanks for your order.</h2>
    <p>Your purchase details are below.</p>
    <div class="items">
      <h3>Items</h3>
      ${items.map(item => `<div><span>🛍️ ${item.name}</span><span>£${item.price.toFixed(2)}</span></div>`).join('')}
    </div>
    <div class="payment">
      <h3>Payment</h3>
      <p>Bill to: ${userName}</p>
      <p>${email}</p>
      <p>Billing Address:</p>
      <p>123 Example Street</p>
      <p>City, ZIP</p>
      <p>Country</p>
      <p>Order Total: £${total.toFixed(2)}</p>
    </div>
    <div class="faq">
      <h3>Common Questions</h3>
      <div>How do I track my order? You can track your order in your FOREMADE account dashboard under the “My Orders” section.</div>
      <div>Need help? Contact us at support@foremade.com or visit our Help Center.</div>
    </div>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#">Terms</a> &nbsp;•&nbsp; <a href="#">Privacy</a></p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendFeedbackRequestEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'We’d Love Your Feedback - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Feedback Request - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.order-number { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Feedback Request</h2></div><div class="content"><h1>We’d Love Your Feedback!</h1><p>Hi ${userName},</p><p>Thank you for your recent order <span class="order-number">#${orderNumber}</span>. We’d love to hear about your experience!</p><p>Take a moment to share your thoughts:</p><a href="https://foremade.com/feedback" class="button">Leave Feedback</a><p style="margin-top: 40px;">Your input helps us improve.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you made a purchase at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendAbandonedCartEmail({ email, name, items }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !items) {
    throw new Error('Valid email and items are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Cart is Waiting - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Abandoned Cart - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.items { text-align: left; margin-bottom: 20px; }.items div { display: flex; justify-content: space-between; padding: 10px 0; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Abandoned Cart</h2></div><div class="content"><h1>Your Cart is Waiting!</h1><p>Hi ${userName},</p><p>You left some items in your cart. Here’s what we saved for you:</p><div class="items">${items.map(item => `<div><span>🛍️ ${item.name}</span><span>£${item.price.toFixed(2)}</span></div>`).join('')}</div><p>Complete your purchase now:</p><a href="https://foremade.com/cart" class="button">Go to Cart</a><p style="margin-top: 40px;">Don’t miss out—shop now!</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you left items in your cart at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendListingRejectedGenericEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Listing Was Rejected - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Listing Rejected - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Listing Update</h2></div><div class="content"><h1>Your Listing Was Rejected</h1><p>Hi ${userName},</p><p>We regret to inform you that your recent listing was not approved due to policy violations.</p><p>Please review our guidelines and resubmit if needed:</p><a href="https://foremade.com/guidelines" class="button">View Guidelines</a><p style="margin-top: 40px;">For assistance, reach out to us.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you submitted a listing at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendSupportRequestEmail({ email, name, requestId }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !requestId) {
    throw new Error('Valid email and requestId are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Support Request - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Support Request - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.request-id { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Support Request</h2></div><div class="content"><h1>Your Support Request</h1><p>Hi ${userName},</p><p>Thank you for reaching out! Your support request <span class="request-id">#${requestId}</span> has been received.</p><p>We’ll get back to you soon with a resolution.</p><p>Track your request here:</p><a href="https://foremade.com/support/track/${requestId}" class="button">Track Request</a><p style="margin-top: 40px;">We’re here to help!</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you submitted a request at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProSellerApprovedEmail({ email }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Congratulations! Your Pro Seller Request have been Approved - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - Pro Seller Approved</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .button { display: inline-block; background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 16px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>Congratulations!</h2>
    <p>Your request to become a FOREMADE Pro Seller has been approved.</p>
    <p>You now have access to enhanced tools, advanced analytics, and more selling opportunities.</p>
    <a href="https://foremade.com/pro-seller-dashboard" class="button">Go to Pro Seller Dashboard</a>
    <p>We're excited to have you on board as a Pro Seller. Let’s grow your business together!</p>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#">Terms</a> &nbsp;•&nbsp; <a href="#">Privacy</a></p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProSellerRejectedEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Pro Seller Request Was Rejected - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Pro Seller Rejected - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Pro Seller Update</h2></div><div class="content"><h1>Your Pro Seller Request Was Rejected</h1><p>Hi ${userName},</p><p>We regret to inform you that your request to become a Pro Seller was not approved.</p><p>Please review our requirements or contact support for more details:</p><a href="https://foremade.com/support" class="button">Contact Support</a><p style="margin-top: 40px;">We value your interest in FOREMADE.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you applied for Pro Seller at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProductRejectedEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Product Was Rejected - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Product Rejected - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Product Update</h2></div><div class="content"><h1>Your Product Was Rejected</h1><p>Hi ${userName},</p><p>We regret to inform you that your product listing was not approved due to policy violations.</p><p>Check our guidelines and resubmit if needed:</p><a href="https://foremade.com/guidelines" class="button">View Guidelines</a><p style="margin-top: 40px;">For help, feel free to contact us.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you submitted a product at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProductApprovedEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Product Was Approved - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Product Approved - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Product Update</h2></div><div class="content"><h1>Your Product Was Approved</h1><p>Hi ${userName},</p><p>Congratulations! Your product listing has been approved and is now live on FOREMADE.</p><p>Manage it here:</p><a href="https://foremade.com/dashboard" class="button">Go to Dashboard</a><p style="margin-top: 40px;">Happy selling!</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because your product was approved at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendOTPEmail({ email, otp }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !otp) {
    throw new Error('Valid email and OTP are required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Verification Code - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - Verification Code</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .otp-code { font-weight: bold; font-size: 32px; color: #000000; margin: 20px 0; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>Your Verification Code</h2>
    <p>Use the following one-time password (OTP) to complete your login or verification process:</p>
    <div class="otp-code">${otp}</div>
    <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#">Terms</a> &nbsp;•&nbsp; <a href="#">Privacy</a></p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendEmailVerification({ email, verificationLink }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !verificationLink) {
    throw new Error('Valid email and verification link are required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Welcome to FOREMADE - Verify Your Email',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - Welcome</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .button { display: inline-block; background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 16px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>Welcome to FOREMADE!</h2>
    <p>Thanks for signing up. To complete your registration and start using your FOREMADE account, please verify your email address below.</p>
    <a href="${verificationLink}" class="button">Verify Email</a>
    <p>If you did not create an account with FOREMADE, you can safely ignore this email.</p>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#">Terms</a> &nbsp;•&nbsp; <a href="#">Privacy</a></p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProSellerRequestReceived({ email }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Pro Seller Request Received - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - Pro Seller Request</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>Pro Seller Request Received</h2>
    <p>Thank you for submitting your request to become a FOREMADE Pro Seller.</p>
    <p>Our team is currently reviewing your application. You will be notified via email once your request has been reviewed and approved.</p>
    <p>In the meantime, you can continue managing your current listings and exploring FOREMADE’s tools available to all sellers.</p>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#">Terms</a> &nbsp;•&nbsp; <a href="#">Privacy</a></p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProductBumpReceipt({ email, duration, amount, startTime, endTime }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !duration || !amount || !startTime || !endTime) {
    throw new Error('Valid email, duration, amount, startTime, and endTime are required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Product Bump Activated - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Membership Revoked</title>
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0;">

    <div style="background-color: #001F3F; padding: 20px;">
      <h1 style="margin: 0; color: white; font-size: 22px;">FOREMADE<br><span style="font-size: 14px; color: #cccccc;">MARKETPLACE</span></h1>
    </div>

    <div style="padding: 30px 20px 10px;">
      <h2 style="margin-top: 0; color: #cc0000;">Membership Revoked</h2>
      <p style="color: #666;">We regret to inform you that your FOREMADE Membership has been revoked.</p>
      <p style="color: #666;">This may be due to a policy violation, non-compliance, or other membership-related issues. Your seller account may still operate under limited access if applicable.</p>
    </div>

    <div style="padding: 20px;">
      <p style="font-size: 14px; color: #333;">If you believe this was a mistake or would like to appeal the decision, please contact our support team for assistance.</p>
    </div>

    <div style="padding: 20px; text-align: center;">
      <a href="mailto:support@foremade.com" style="background-color: #001F3F; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Contact Support</a>
    </div>

    <div style="padding: 15px 20px; text-align: center; font-size: 12px; color: #999;">
      FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#" style="color: #999;">Terms</a> &nbsp;•&nbsp; <a href="#" style="color: #999;">Privacy</a>
    </div>

  </div>
</body>
</html>
`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendMembershipRevokedEmail({ email }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Membership Revoked - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - Membership Revoked</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .button { display: inline-block; background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 16px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>Membership Revoked</h2>
    <p>We regret to inform you that your FOREMADE Membership has been revoked.</p>
    <p>This may be due to a policy violation, non-compliance, or other membership-related issues. Your seller account may still operate under limited access if applicable.</p>
    <p>If you believe this was a mistake or would like to appeal the decision, please contact our support team for assistance.</p>
    <a href="https://foremade.com/support" class="button">Contact Support</a>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#">Terms</a> &nbsp;•&nbsp; <a href="#">Privacy</a></p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendShippingConfirmationEmail,
  sendRefundApprovedEmail,
  sendOrderCancelledEmail,
  sendOrderConfirmationSimpleEmail,
  sendFeedbackRequestEmail,
  sendAbandonedCartEmail,
  sendListingRejectedGenericEmail,
  sendSupportRequestEmail,
  sendProSellerApprovedEmail,
  sendProSellerRejectedEmail,
  sendProductRejectedEmail,
  sendProductApprovedEmail,
  sendOTPEmail,
  sendEmailVerification,
  sendProSellerRequestReceived,
  sendProductBumpReceipt,
  sendMembershipRevokedEmail,
};