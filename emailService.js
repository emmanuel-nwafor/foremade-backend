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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>Shipping Confirmation</h2>
  </div>
  <div class=\"content\">
    <h1>Your Order is on the Way!</h1>
    <p>Hi ${userName},</p>
    <p>Great news! Your order <span class=\"order-number\">#${orderNumber}</span> has been shipped and is on its way to you.</p>
    <p>Estimated delivery: <strong>3–5 business days</strong><br>You can track your shipment using the button below:</p>
    <a href=\"https://foremade.com/track-order\" class=\"button\">Track Your Order</a>
    <p style=\"margin-top: 40px;\">Thank you for shopping with FOREMADE.</p>
    <p>Warm regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class=\"footer\">
    <p>
      Questions? Contact us at 
      <a href=\"mailto:support@foremade.com\">support@foremade.com</a><br />
      You received this email because you made a purchase at 
      <a href=\"https://foremade.com\">foremade.com</a>.
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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>Refund Approved</h2>
  </div>
  <div class=\"content\">
    <h1>Your Refund Has Been Approved</h1>
    <p>Hi ${userName},</p>
    <p>We're pleased to let you know that your refund for Order <span class=\"order-number\">#${orderNumber}</span> has been approved.</p>
    <p>The funds are now being processed and should arrive in your account within 2–5 working days, depending on your bank.</p>
    <a href=\"https://foremade.com/orders\" class=\"button\">View Order</a>
    <p style=\"margin-top: 40px;\">If you have any questions, please don’t hesitate to reach out.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class=\"footer\">
    <p>
      Need help? Contact us at 
      <a href=\"mailto:support@foremade.com\">support@foremade.com</a> <br />
      You received this email because of a refund update on 
      <a href=\"https://foremade.com\">foremade.com</a>.
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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>Order Cancelled</h2>
  </div>
  <div class=\"content\">
    <h1>Your Order Has Been Cancelled</h1>
    <p>Hi ${userName},</p>
    <p>We’re sorry to inform you that your order with FOREMADE has been cancelled.</p>
    <p>Order number: <span class=\"order-number\">#${orderNumber}</span></p>
    <p>If you were charged, your refund will be processed within 5–7 business days.</p>
    <a href=\"https://foremade.com/orders\" class=\"button\">View Orders</a>
    <p style=\"margin-top: 40px;\">If you have any questions, we're here to help.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class=\"footer\">
    <p>
      Need help? Contact us at 
      <a href=\"mailto:support@foremade.com\">support@foremade.com</a> <br />
      You received this email because of an order update on 
      <a href=\"https://foremade.com\">foremade.com</a>.
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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>Order Confirmation</h2>
  </div>
  <div class=\"content\">
    <h1>Thank You for Your Order!</h1>
    <p>Hi ${userName},</p>
    <p>We are pleased to confirm that your order with FOREMADE has been successfully placed.</p>
    <p>Your order number is: <span class=\"order-number\">#${orderNumber}</span></p>
    <a href=\"https://foremade.com/orders\" class=\"button\">View Order</a>
    <p style=\"margin-top: 40px;\">If you have any questions or need assistance, please feel free to get in touch.</p>
    <p>Best regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class=\"footer\">
    <p>
      Need help? Contact us at 
      <a href=\"mailto:support@foremade.com\">support@foremade.com</a> <br />
      You received this email because you made a purchase at 
      <a href=\"https://foremade.com\">foremade.com</a>.
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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>We Value Your Feedback</h2>
  </div>
  <div class=\"content\">
    <h1>How Did We Do?</h1>
    <p>Hi ${userName},</p>
    <p>We'd love to hear your thoughts about your recent experience with FOREMADE. <br>On a scale from 1 to 10, how satisfied were you?</p>
    <div class=\"scale\">
      <a href=\"#\">1</a>
      <a href=\"#\">2</a>
      <a href=\"#\">3</a>
      <a href=\"#\">4</a>
      <a href=\"#\">5<br><small>Good</small></a>
      <a href=\"#\">6</a>
      <a href=\"#\">7<br><small>Very Good</small></a>
      <a href=\"#\">8</a>
      <a href=\"#\">9</a>
      <a href=\"#\">10<br><small>Excellent</small></a>
    </div>
    <p>Thank you for helping us improve.</p>
    <p>Warm regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class=\"footer\">
    <p>
      Need help? Contact us at 
      <a href=\"mailto:support@foremade.com\">support@foremade.com</a> <br />
      You received this email because of a recent interaction with 
      <a href=\"https://foremade.com\">foremade.com</a>.
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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>We Saved Your Cart</h2>
  </div>
  <div class=\"content\">
    <h1>Still Thinking It Over?</h1>
    <p>Hi ${userName},</p>
    <p>You left some great finds in your cart. We’ve saved them just for you — but they won’t last forever.</p>
    <p>Complete your purchase now before these items go out of stock!</p>
    <a href=\"https://foremade.com/cart\" class=\"button\">Return to Your Cart</a>
    <p style=\"margin-top: 40px;\">Need help checking out or have questions? We’re here for you.</p>
    <p>Warm regards,<br><strong>The FOREMADE Team</strong></p>
  </div>
  <div class=\"footer\">
    <p>Need help? Contact us at <a href=\"mailto:support@foremade.com\">support@foremade.com</a> <br />You received this email because you left items in your cart at <a href=\"https://foremade.com\">foremade.com</a>.</p>
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
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>
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
  <div class=\"header\">
    <img src=\"https://foremade.com/logo.png\" alt=\"FOREMADE Logo\" />
    <h2>Your Item Listing Has Been Rejected</h2>
  </div>
  <div class=\"content\">
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
  <div class=\"footer\">
    <p>
      Need help? Contact us at 
      <a href=\"mailto:support@foremade.com\">support@foremade.com</a><br />
      You received this email because you submitted a product to list on 
      <a href=\"https://foremade.com\">foremade.com</a>.
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
}; 