const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Shipping Confirmation Email
async function sendShippingConfirmationEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Order is on the Way - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your Order is on the Way - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .order-number { font-weight: bold; color: #0F2940; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Shipping Confirmation</h2>
  </div>
  <div class="content">
    <h1>Your Order is on the Way!</h1>
    <p>Hi ${userName},</p>
    <p>Great news! Your order <span class="order-number">#${orderNumber}</span> has been shipped and is on its way to you.</p>
    <p>Estimated delivery: <strong>3–5 business days</strong><br>You can track your shipment using the button below:</p>
    <a href="https://foremade.com/track-order" class="button">Track Your Order</a>
    <p style="margin-top: 40px;">Thank you for shopping with FOREMADE.</p>
    <p>Warm regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Questions? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a><br />
      You received this email because you made a purchase at 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Refund Approved Email
async function sendRefundApprovedEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Refund Approved - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Refund Approved - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .order-number { font-weight: bold; color: #0F2940; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Refund Approved</h2>
  </div>
  <div class="content">
    <h1>Your Refund Has Been Approved</h1>
    <p>Hi ${userName},</p>
    <p>We're pleased to let you know that your refund for Order <span class="order-number">#${orderNumber}</span> has been approved.</p>
    <p>The funds are now being processed and should arrive in your account within 2–5 working days, depending on your bank.</p>
    <a href="https://foremade.com/orders" class="button">View Order</a>
    <p style="margin-top: 40px;">If you have any questions, please don’t hesitate to reach out.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a> <br />
      You received this email because of a refund update on 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Order Cancelled Email
async function sendOrderCancelledEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Order Cancelled - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Cancelled - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .order-number { font-weight: bold; color: #0F2940; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Order Cancelled</h2>
  </div>
  <div class="content">
    <h1>Your Order Has Been Cancelled</h1>
    <p>Hi ${userName},</p>
    <p>We’re sorry to inform you that your order with FOREMADE has been cancelled.</p>
    <p>Order number: <span class="order-number">#${orderNumber}</span></p>
    <p>If you were charged, your refund will be processed within 5–7 business days.</p>
    <a href="https://foremade.com/orders" class="button">View Orders</a>
    <p style="margin-top: 40px;">If you have any questions, we're here to help.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a> <br />
      You received this email because of an order update on 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Order Confirmation (Simple) Email
async function sendOrderConfirmationSimpleEmail({ email, orderNumber, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber) {
    throw new Error('Valid email and orderNumber are required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Order Confirmation - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Confirmation - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .order-number { font-weight: bold; color: #0F2940; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Order Confirmation</h2>
  </div>
  <div class="content">
    <h1>Thank You for Your Order!</h1>
    <p>Hi ${userName},</p>
    <p>We are pleased to confirm that your order with FOREMADE has been successfully placed.</p>
    <p>Your order number is: <span class="order-number">#${orderNumber}</span></p>
    <a href="https://foremade.com/orders" class="button">View Order</a>
    <p style="margin-top: 40px;">If you have any questions or need assistance, please feel free to get in touch.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a> <br />
      You received this email because you made a purchase at 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Feedback Request Email
async function sendFeedbackRequestEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'We Value Your Feedback - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>We Value Your Feedback - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .scale { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-bottom: 30px; }
    .scale a { background-color: #F4F4F4; color: #0F2940; padding: 12px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; transition: background-color 0.3s; }
    .scale a:hover { background-color: #D9782D; color: #fff; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>We Value Your Feedback</h2>
  </div>
  <div class="content">
    <h1>How Did We Do?</h1>
    <p>Hi ${userName},</p>
    <p>We'd love to hear your thoughts about your recent experience with FOREMADE. <br>On a scale from 1 to 10, how satisfied were you?</p>
    <div class="scale">
      <a href="#">1</a>
      <a href="#">2</a>
      <a href="#">3</a>
      <a href="#">4</a>
      <a href="#">5<br><small>Good</small></a>
      <a href="#">6</a>
      <a href="#">7<br><small>Very Good</small></a>
      <a href="#">8</a>
      <a href="#">9</a>
      <a href="#">10<br><small>Excellent</small></a>
    </div>
    <p>Thank you for helping us improve.</p>
    <p>Warm regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a> <br />
      You received this email because of a recent interaction with 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Abandoned Cart Email
async function sendAbandonedCartEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'You Left Something Behind - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>You Left Something Behind - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>We Saved Your Cart</h2>
  </div>
  <div class="content">
    <h1>Still Thinking It Over?</h1>
    <p>Hi ${userName},</p>
    <p>You left some great finds in your cart. We’ve saved them just for you — but they won’t last forever.</p>
    <p>Complete your purchase now before these items go out of stock!</p>
    <a href="https://foremade.com/cart" class="button">Return to Your Cart</a>
    <p style="margin-top: 40px;">Need help checking out or have questions? We’re here for you.</p>
    <p>Warm regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>Need help? Contact us at <a href="mailto:support@foremade.com">support@foremade.com</a> <br />You received this email because you left items in your cart at <a href="https://foremade.com">foremade.com</a>.</p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Listing Rejected (Generic) Email
async function sendListingRejectedGenericEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || '';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Item Listing Rejected - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Item Listing Rejected - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: left; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; text-align: center; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    ul { margin-bottom: 25px; padding-left: 20px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Your Item Listing Has Been Rejected</h2>
  </div>
  <div class="content">
    <p><strong>Hello${userName ? ', ' + userName : ''},</strong></p>
    <p>Thank you for submitting your item to FOREMADE.</p>
    <p>Unfortunately, your listing did not meet our marketplace criteria and has not been approved.</p>
    <p>Here are a few possible reasons for rejection:</p>
    <ul>
      <li>The item does not meet our quality standards.</li>
      <li>The product description or category is unclear.</li>
      <li>The item falls under a prohibited category.</li>
    </ul>
    <p>We encourage you to review our seller guidelines and make the necessary updates before resubmitting.</p>
    <p>If you believe this decision was made in error, feel free to contact our support team for clarification or assistance.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a><br />
      You received this email because you submitted a product to list on 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Support Request Email
async function sendSupportRequestEmail({ fromEmail, fromName, subject, message }) {
  if (!subject || !message) {
    throw new Error('Subject and message are required');
  }
  const sender = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const mailOptions = {
    from: `FOREMADE Support Request <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: 'support@foremade.com',
    subject: `[Support Request] ${subject}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Support Request - FOREMADE</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff; color: #0F2940; }
    .container { max-width: 600px; margin: 0 auto; padding: 30px; background: #f9f9f9; border-radius: 8px; }
    .header { background-color: #0F2940; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { font-size: 13px; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>New Support Request</h2>
    </div>
    <div class="content">
      <p><strong>From:</strong> ${fromName ? fromName : 'User'} (${fromEmail || 'N/A'})</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    </div>
    <div class="footer">
      <p>This message was sent from the FOREMADE support request form.</p>
    </div>
  </div>
</body>
</html>`
  };
  await transporter.sendMail(mailOptions);
}

// Pro Seller Approved Email
async function sendProSellerApprovedEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `FOREMADE <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Congratulations! Your Pro Seller Application is Approved - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Pro Seller Approved - FOREMADE</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff; color: #0F2940; }
    .container { max-width: 600px; margin: 0 auto; padding: 30px; background: #f9f9f9; border-radius: 8px; }
    .header { background-color: #0F2940; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { font-size: 13px; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Welcome to FOREMADE Pro Seller!</h2>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>Congratulations! Your application to become a <strong>Pro Seller</strong> on FOREMADE has been <span style="color: #28a745; font-weight: bold;">approved</span>.</p>
      <p>You now have access to exclusive features, priority support, and more tools to grow your business.</p>
      <p>Get started by logging in to your dashboard and exploring your new Pro Seller features.</p>
      <a href="https://foremade.com/dashboard" style="display: inline-block; background: #0F2940; color: #fff; padding: 12px 24px; border-radius: 5px; text-decoration: none; margin-top: 20px;">Go to Dashboard</a>
      <p style="margin-top: 30px;">Thank you for choosing FOREMADE. We look forward to your success!</p>
      <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
    </div>
    <div class="footer">
      <p>Questions? Contact us at <a href="mailto:support@foremade.com">support@foremade.com</a></p>
    </div>
  </div>
</body>
</html>`
  };
  await transporter.sendMail(mailOptions);
}

// Pro Seller Rejected Email
async function sendProSellerRejectedEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `FOREMADE <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Update: Your Pro Seller Application Was Not Approved - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Pro Seller Application Not Approved - FOREMADE</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff; color: #0F2940; }
    .container { max-width: 600px; margin: 0 auto; padding: 30px; background: #f9f9f9; border-radius: 8px; }
    .header { background-color: #d32f2f; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { font-size: 13px; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Pro Seller Application Update</h2>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>Thank you for applying to become a <strong>Pro Seller</strong> on FOREMADE.</p>
      <p>Unfortunately, your application was <span style="color: #d32f2f; font-weight: bold;">not approved</span> at this time.</p>
      <p>You are welcome to review your application and try again, or contact our support team for more information.</p>
      <a href="mailto:support@foremade.com" style="display: inline-block; background: #d32f2f; color: #fff; padding: 12px 24px; border-radius: 5px; text-decoration: none; margin-top: 20px;">Contact Support</a>
      <p style="margin-top: 30px;">We appreciate your interest in FOREMADE and hope to work with you in the future.</p>
      <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
    </div>
    <div class="footer">
      <p>Questions? Contact us at <a href="mailto:support@foremade.com">support@foremade.com</a></p>
    </div>
  </div>
</body>
</html>`
  };
  await transporter.sendMail(mailOptions);
}

// Product Rejected Email
async function sendProductRejectedEmail({ email, productName, reason }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !productName || !reason) {
    throw new Error('Valid email, productName, and reason are required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Product Listing Has Been Rejected - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Product Listing Rejected - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: left; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; text-align: center; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .reason { font-weight: bold; color: #0F2940; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Your Product Listing Has Been Rejected</h2>
  </div>
  <div class="content">
    <p><strong>Hello,</strong></p>
    <p>Thank you for submitting your product, <strong>${productName}</strong>, to FOREMADE.</p>
    <p>Unfortunately, your product listing has not been approved for the following reason:</p>
    <p class="reason">${reason}</p>
    <p>We encourage you to review our <a href="https://foremade.com/pro-seller-guide">seller guidelines</a> and make the necessary updates before resubmitting your product.</p>
    <p>If you believe this decision was made in error or need further clarification, please contact our support team.</p>
    <a href="https://foremade.com/support" class="button">Contact Support</a>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a><br />
      You received this email because you submitted a product to list on 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

// Product Approved Email
async function sendProductApprovedEmail({ email, productName }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !productName) {
    throw new Error('Valid email and productName are required');
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Your Product Listing Has Been Approved - FOREMADE',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Product Listing Approved - FOREMADE</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }
    .header { background-color: #0F2940; text-align: center; padding: 40px 20px; }
    .header img { max-width: 180px; margin-bottom: 10px; }
    .header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: left; }
    .content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; text-align: center; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
    .product-name { font-weight: bold; color: #0F2940; }
    .button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
    .footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }
    .footer a { color: #0F2940; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" />
    <h2>Your Product Listing Has Been Approved</h2>
  </div>
  <div class="content">
    <p><strong>Hello,</strong></p>
    <p>Congratulations! Your product, <span class="product-name">${productName}</span>, has been approved and is now live on FOREMADE.</p>
    <p>Your listing is ready for customers to discover and purchase. You can view or manage your listing in your seller dashboard.</p>
    <a href="https://foremade.com/dashboard" class="button">View Your Listing</a>
    <p>Thank you for being a part of the FOREMADE marketplace. If you have any questions, our support team is here to help.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class="footer">
    <p>
      Need help? Contact us at 
      <a href="mailto:support@foremade.com">support@foremade.com</a><br />
      You received this email because you submitted a product to list on 
      <a href="https://foremade.com">foremade.com</a>.
    </p>
    <p>© 2025 FOREMADE. All rights reserved.</p>
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
};
