// Send Youth Empowerment Application Email
async function sendYouthEmpowermentApplication(formData) {
  const {
    firstName,
    lastName,
    email,
    phone,
    age,
    location,
    education,
    skills,
    motivation
  } = formData;

  const toEmail = 'yehub@foremade.com';
  const subject = 'New Youth Empowerment Application Submission';
  const html = `
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f7f7f7; color: #222; }
          .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 32px; }
          h2 { color: #0F2940; }
          .field { margin-bottom: 16px; }
          .label { font-weight: bold; color: #0F2940; }
          .value { margin-left: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Youth Empowerment Application</h2>
          <div class="field"><span class="label">Name:</span><span class="value">${firstName || ''} ${lastName || ''}</span></div>
          <div class="field"><span class="label">Email:</span><span class="value">${email || ''}</span></div>
          <div class="field"><span class="label">Phone:</span><span class="value">${phone || ''}</span></div>
          <div class="field"><span class="label">Age:</span><span class="value">${age || ''}</span></div>
          <div class="field"><span class="label">Location:</span><span class="value">${location || ''}</span></div>
          <div class="field"><span class="label">Education:</span><span class="value">${education || ''}</span></div>
          <div class="field"><span class="label">Skills:</span><span class="value">${Array.isArray(skills) ? skills.join(', ') : skills || ''}</span></div>
          <div class="field"><span class="label">Motivation:</span><span class="value">${motivation || ''}</span></div>
        </div>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"FOREMADE" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: toEmail,
    subject,
    html
  });
}
// Sends a dispatch notification email to a customer
async function sendDispatchEmail({
  email,
  brandLogoUrl = 'https://via.placeholder.com/140x32?text=FOREMADE',
  appDeepLinkOrders = '#',
  arrivalWindow = 'tomorrow',
  orderNumber = 'FM-2025-00001',
  customerName = 'Customer',
  city = 'Lagos',
  orderDate = '10 Aug 2025',
  trackingUrl = '#',
  itemImageUrl = 'https://via.placeholder.com/200',
  itemTitle = 'Product title goes here',
  sellerName = 'FOREMADE Seller',
  itemCondition = 'New',
  quantity = 1,
  itemPrice = 18.70,
  subTotal = 18.70,
  deliveryCostLabel = 'Free',
  orderTotal = 18.70,
  customerEmail = 'customer@example.com',
  supportUrl = '#',
  privacyUrl = '#',
  currency = 'GBP'
}) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  let currencySymbol = '£';
  if (currency.toUpperCase() === 'NGN') currencySymbol = '₦';
  else if (currency.toUpperCase() === 'USD') currencySymbol = '$';
  else if (currency.toUpperCase() === 'EUR') currencySymbol = '€';
  // ...add more as needed
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Order Dispatched</title>
  <style>
    .bg{background:#ffffff;}
    .brandbar{background:#0E6FFF;}
    .accent{color:#FF6A00;}
    .btn{background:#FF6A00;color:#ffffff;text-decoration:none;display:inline-block;padding:12px 18px;border-radius:6px;font-weight:600;}
    body{margin:0;padding:0;background:#f5f7fb;}
    table{border-collapse:collapse!important;}
    img{border:0;outline:none;text-decoration:none;max-width:100%;height:auto;}
    .container{max-width:640px;margin:0 auto;width:100%;}
    .card{background:#ffffff;border-radius:12px;border:1px solid #eef1f6;}
    .p-24{padding:24px;}
    .p-16{padding:16px;}
    .mt-8{margin-top:8px;}
    .mt-16{margin-top:16px;}
    .mt-24{margin-top:24px;}
    .muted{color:#6b7280;font-size:14px;}
    .title{font-size:20px;line-height:1.3;margin:0;}
    .h1{font-size:24px;margin:0 0 6px;}
    .price{font-weight:700;}
    .tracker{width:100%;margin-top:8px;}
    .dot{width:18px;height:18px;border-radius:50%;background:#d7def0;display:inline-block;position:relative;}
    .dot.active{background:#0E6FFF;}
    .bar{height:4px;background:#d7def0;flex:1;margin:0 6px;border-radius:4px;position:relative;}
    .bar.fill:after{content:'';position:absolute;left:0;top:0;bottom:0;width:100%;background:#0E6FFF;border-radius:4px;}
    .labels td{font-size:12px;color:#6b7280;padding-top:6px;}
    @media (max-width: 480px){
      .p-24{padding:18px;}
      .title{font-size:18px;}
      .h1{font-size:22px;}
    }
  </style>
</head>
<body>
  <center>
    <table role="presentation" class="container" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="brandbar" style="padding:16px 24px;">
          <table width="100%">
            <tr>
              <td align="left">
                <img src="${brandLogoUrl}" alt="FOREMADE" width="140">
              </td>
              <td align="right" style="color:#ffffff;font-size:14px;">
                <a href="${appDeepLinkOrders}" style="color:#ffffff;text-decoration:none;">Your Orders</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr><td style="height:18px;"></td></tr>

      <tr>
        <td class="card p-24">
          <p class="h1">Your package was <span class="accent">dispatched!</span></p>
          <p class="muted mt-8">Arriving <strong>${arrivalWindow}</strong></p>

          <table class="tracker" role="presentation">
            <tr>
              <td style="padding:8px 0;">
                <table role="presentation" width="100%">
                  <tr>
                    <td width="24"><span class="dot active"></span></td>
                    <td><div class="bar fill"></div></td>
                    <td width="24"><span class="dot active"></span></td>
                    <td><div class="bar"></div></td>
                    <td width="24"><span class="dot"></span></td>
                    <td><div class="bar"></div></td>
                    <td width="24"><span class="dot"></span></td>
                  </tr>
                  <tr class="labels">
                    <td align="center">Ordered</td>
                    <td></td>
                    <td align="center"><strong>Dispatched</strong></td>
                    <td></td>
                    <td align="center">Out for delivery</td>
                    <td></td>
                    <td align="center">Delivered</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" class="mt-16">
            <tr>
              <td>
                <p class="title">Order <strong>#${orderNumber}</strong></p>
                <p class="muted mt-8">
                  ${customerName} — ${city}<br>
                  Placed on ${orderDate}
                </p>
              </td>
              <td align="right">
                <a class="btn" href="${trackingUrl}">Track package</a>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" class="mt-24">
            <tr>
              <td class="p-16" style="border:1px solid #eef1f6;border-radius:10px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td width="84">
                      <img src="${itemImageUrl}" alt="${itemTitle}" width="84">
                    </td>
                    <td class="p-16" style="vertical-align:top;">
                      <div style="font-weight:600;line-height:1.4;">${itemTitle}</div>
                      <div class="muted mt-8">Sold by ${sellerName}</div>
                      <div class="muted mt-8">Condition: ${itemCondition} • Qty: ${quantity}</div>
                    </td>
                    <td align="right" style="vertical-align:top;">
                      <div class="price">${currencySymbol}${itemPrice}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" class="mt-16">
            <tr>
              <td class="muted">Subtotal</td>
              <td align="right">${currencySymbol}${subTotal}</td>
            </tr>
            <tr>
              <td class="muted">Delivery</td>
              <td align="right">${deliveryCostLabel}</td>
            </tr>
            <tr>
              <td style="padding-top:8px;font-weight:700;">Total</td>
              <td align="right" style="padding-top:8px;font-weight:700;">${currencySymbol}${orderTotal}</td>
            </tr>
          </table>

          <p class="muted mt-24">
            We’ll let you know when your package is out for delivery. You can track updates any time in the Foremade app.
          </p>

          <div class="mt-16">
            <a class="btn" href="${appDeepLinkOrders}">View in App</a>
          </div>
        </td>
      </tr>

      <tr><td style="height:18px;"></td></tr>

      <tr>
        <td class="p-24 muted">
          Foremade is a trading name of Foremade Inc. This notification was sent to ${customerEmail} for order ${orderNumber}.
          <br><br>
          Questions? <a href="${supportUrl}" style="color:#0E6FFF;text-decoration:none;">Contact Support</a> • 
          <a href="${privacyUrl}" style="color:#0E6FFF;text-decoration:none;">Privacy Notice</a>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
  const mailOptions = {
    from: `"FOREMADE" <${process.env.SALES_EMAIL || process.env.EMAIL_USER || 'sales@foremade.com'}>`,
    to: email,
    subject: 'Your Package Was Dispatched - FOREMADE',
    html
  };
  await transporter.sendMail(mailOptions);
}
// Sends all email templates to a given email address for testing/demo purposes
async function sendAllTemplatesTo(email) {
  const testName = 'Test User';
  const testOrderNumber = 'ORDER12345';
  const testItems = [
    { name: 'Test Product 1', price: 19.99 },
    { name: 'Test Product 2', price: 29.99 }
  ];
  const testTotal = 49.98;
  const testOtp = '123456';
  const testVerificationLink = 'https://foremade.com/verify?token=abc123';
  const testRequestId = 'REQ-98765';
  const testDuration = '7 days';
  const testAmount = 10.00;
  const testStartTime = '2025-08-20T10:00:00Z';
  const testEndTime = '2025-08-27T10:00:00Z';
  const testCurrency = 'NGN';
  const testBillingAddress = {
    street: '456 Real Avenue',
    city: 'Lagos',
    zip: '100001',
    country: 'Nigeria'
  };

  await sendShippingConfirmationEmail({ email, orderNumber: testOrderNumber, name: testName });
  await sendRefundApprovedEmail({ email, orderNumber: testOrderNumber, name: testName });
  await sendOrderCancelledEmail({ email, orderNumber: testOrderNumber, name: testName });
  await sendOrderConfirmationSimpleEmail({ email, orderNumber: testOrderNumber, name: testName, items: testItems, total: testTotal, currency: testCurrency, billingAddress: testBillingAddress });
  await sendFeedbackRequestEmail({ email, orderNumber: testOrderNumber, name: testName });
  await sendAbandonedCartEmail({ email, name: testName, items: testItems, currency: testCurrency });
  await sendListingRejectedGenericEmail({ email, name: testName });
  await sendSupportRequestEmail({ email, name: testName, requestId: testRequestId });
  await sendProSellerApprovedEmail({ email });
  await sendProSellerRejectedEmail({ email, name: testName });
  await sendProductRejectedEmail({ email, name: testName });
  await sendProductApprovedEmail({ email, name: testName });
  await sendOTPEmail({ email, otp: testOtp });
  await sendEmailVerification({ email, verificationLink: testVerificationLink });
  await sendProSellerRequestReceived({ email });
  await sendProductBumpReceipt({ email, duration: testDuration, amount: testAmount, startTime: testStartTime, endTime: testEndTime, currency: testCurrency });
  await sendMembershipRevokedEmail({ email });
}
const nodemailer = require('nodemailer');

// Replace Gmail config with cPanel SMTP SSL/TLS config
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // e.g. 'mail.yourdomain.com'
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465, // 465 for SSL/TLS, 587 for STARTTLS
  secure: process.env.SMTP_SECURE === 'true' || (!process.env.SMTP_SECURE && (!process.env.SMTP_PORT || process.env.SMTP_PORT === '465')), // true for SSL/TLS, false for STARTTLS
  auth: {
    user: process.env.EMAIL_USER, // your cPanel email address
    pass: process.env.EMAIL_PASS  // your cPanel email password
  },
  requireTLS: process.env.SMTP_REQUIRE_TLS === 'true', // for STARTTLS
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
    from: `"FOREMADE" <${process.env.SALES_EMAIL || process.env.EMAIL_USER || 'sales@foremade.com'}>`,
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
    from: `"FOREMADE" <${process.env.SALES_EMAIL || process.env.EMAIL_USER || 'sales@foremade.com'}>`,
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
    from: `"FOREMADE" <${process.env.SALES_EMAIL || process.env.EMAIL_USER || 'sales@foremade.com'}>`,
    to: email,
    subject: 'Your Order Has Been Cancelled - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Order Cancelled - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.order-number { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Order Cancellation</h2></div><div class="content"><h1>Your Order Has Been Cancelled</h1><p>Hi ${userName},</p><p>We regret to inform you that your order <span class="order-number">#${orderNumber}</span> has been cancelled.</p><p>If this was unintentional, please contact us immediately to resolve the issue:</p><a href="https://foremade.com/support" class="button">Contact Support</a><p style="margin-top: 40px;">Thank you for your understanding.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because your order was cancelled at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendOrderConfirmationSimpleEmail({ email, orderNumber, name, items, total, currency = 'NGN', billingAddress }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderNumber || !items || !total) {
    throw new Error('Valid email, orderNumber, items, and total are required');
  }
  const userName = name || 'there';
  let currencySymbol = '₦';
  if (currency.toUpperCase() === 'GBP') currencySymbol = '£';
  else if (currency.toUpperCase() === 'USD') currencySymbol = '$';
  else if (currency.toUpperCase() === 'EUR') currencySymbol = '€';
  // Format billing address
  let billingAddressHtml = '';
  if (billingAddress) {
    if (typeof billingAddress === 'string') {
      billingAddressHtml = `<p>${billingAddress}</p>`;
    } else if (typeof billingAddress === 'object') {
      billingAddressHtml = `<p>${billingAddress.street || ''}</p><p>${billingAddress.city || ''}${billingAddress.zip ? ', ' + billingAddress.zip : ''}</p><p>${billingAddress.country || ''}</p>`;
    }
  } else {
    billingAddressHtml = `<p>Not Provided</p>`;
  }
  const mailOptions = {
    from: `"FOREMADE" <${process.env.SALES_EMAIL || process.env.EMAIL_USER || 'sales@foremade.com'}>`,
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
      ${items.map(item => `<div><span>🛍️ ${item.name}</span><span>${currencySymbol}${item.price.toFixed(2)}</span></div>`).join('')}
    </div>
    <div class="payment">
      <h3>Payment</h3>
      <p>Bill to: ${userName}</p>
      <p>${email}</p>
      <p>Billing Address:</p>
      ${billingAddressHtml}
      <p>Order Total: ${currencySymbol}${total.toFixed(2)}</p>
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
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: 'We’d Love Your Feedback - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Feedback Request - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.order-number { font-weight: bold; color: #0F2940; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Feedback Request</h2></div><div class="content"><h1>We’d Love Your Feedback!</h1><p>Hi ${userName},</p><p>Thank you for your recent order <span class="order-number">#${orderNumber}</span>. We’d love to hear about your experience!</p><p>Take a moment to share your thoughts:</p><a href="https://foremade.com/feedback" class="button">Leave Feedback</a><p style="margin-top: 40px;">Your input helps us improve.</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you made a purchase at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendAbandonedCartEmail({ email, name, items, currency = 'NGN' }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !items) {
    throw new Error('Valid email and items are required');
  }
  const userName = name || 'there';
  let currencySymbol = '₦';
  if (currency.toUpperCase() === 'GBP') currencySymbol = '£';
  else if (currency.toUpperCase() === 'USD') currencySymbol = '$';
  else if (currency.toUpperCase() === 'EUR') currencySymbol = '€';
  const mailOptions = {
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: 'Your Cart is Waiting - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Abandoned Cart - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.items { text-align: left; margin-bottom: 20px; }.items div { display: flex; justify-content: space-between; padding: 10px 0; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Abandoned Cart</h2></div><div class="content"><h1>Your Cart is Waiting!</h1><p>Hi ${userName},</p><p>You left some items in your cart. Here’s what we saved for you:</p><div class="items">${items.map(item => `<div><span>🛍️ ${item.name}</span><span>${currencySymbol}${item.price.toFixed(2)}</span></div>`).join('')}</div><p>Complete your purchase now:</p><a href="https://foremade.com/cart" class="button">Go to Cart</a><p style="margin-top: 40px;">Don’t miss out—shop now!</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because you left items in your cart at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendListingRejectedGenericEmail({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }
  const userName = name || 'there';
  const mailOptions = {
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
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
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
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
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: 'Congratulations! Your Pro Seller Request have been Approved - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pro Seller Approved</title>
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0;">

    <div style="background-color: #001F3F; padding: 20px;">
      <h1 style="margin: 0; color: white; font-size: 22px;">FOREMADE<br><span style="font-size: 14px; color: #cccccc;">MARKETPLACE</span></h1>
    </div>

    <div style="padding: 30px 20px 10px;">
      <h2 style="margin-top: 0; color: #333;">Congratulations!</h2>
      <p style="color: #666;">Your request to become a FOREMADE Pro Seller has been approved.</p>
      <p style="color: #666;">You now have access to enhanced tools, advanced analytics, and more selling opportunities.</p>
    </div>

    <div style="padding: 20px; text-align: center;">
      <a href="https://www.foremade.com/seller/pro-dashboard" style="background-color: #001F3F; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Go to Pro Seller Dashboard</a>
    </div>

    <div style="padding: 20px;">
      <p style="font-size: 14px; color: #333;">We're excited to have you on board as a Pro Seller. Let’s grow your business together!</p>
    </div>

    <div style="padding: 15px 20px; text-align: center; font-size: 12px; color: #999;">
      FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#" style="color: #999;">Terms</a> &nbsp;•&nbsp; <a href="#" style="color: #999;">Privacy</a>
    </div>

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
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
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
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
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
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: 'Your Product Was Approved - FOREMADE',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Product Approved - FOREMADE</title><style>body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #0F2940; }.header { background-color: #0F2940; text-align: center; padding: 40px 20px; }.header img { max-width: 180px; margin-bottom: 10px; }.header h2 { color: #ffffff; font-size: 22px; margin-top: 10px; }.content { max-width: 600px; margin: 0 auto; padding: 40px 25px; background-color: #ffffff; text-align: center; }.content h1 { color: #D9782D; font-size: 24px; margin-bottom: 20px; }.content p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }.button { display: inline-block; background-color: #0F2940; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }.footer { background-color: #F4F4F4; padding: 30px 20px; text-align: center; font-size: 13px; color: #666666; }.footer a { color: #0F2940; text-decoration: none; }</style></head><body><div class="header"><img src="https://foremade.com/assets/logi-DGW4y32z.png" alt="FOREMADE Logo" /><h2>Product Update</h2></div><div class="content"><h1>Your Product Was Approved</h1><p>Hi ${userName},</p><p>Congratulations! Your product listing has been approved and is now live on FOREMADE.</p><p>Manage it here:</p><a href="https://foremade.com/dashboard" class="button">Go to Dashboard</a><p style="margin-top: 40px;">Happy selling!</p><p>Warm regards,<br><strong>The FOREMADE Team</strong></p></div><div class="footer"><p>Questions? Contact us at<a href="mailto:support@foremade.com">support@foremade.com</a><br />You received this email because your product was approved at<a href="https://foremade.com">foremade.com</a>.</p><p>© 2025 FOREMADE. All rights reserved.</p></div></body></html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendOTPEmail({ email, otp }) {
  if (!email || !otp) throw new Error('Valid email and OTP are required');
  const mailOptions = {
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: 'Your One-Time Password (OTP)',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your One-Time Password (OTP)</title>
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0;">

    <div style="background-color: #001F3F; padding: 20px;">
      <h1 style="margin: 0; color: white; font-size: 22px;">FOREMADE<br><span style="font-size: 14px; color: #cccccc;">MARKETPLACE</span></h1>
    </div>

    <div style="padding: 30px 20px;">
      <h2 style="margin-top: 0; color: #333;">Your Verification Code</h2>
      <p style="color: #666;">Use the following one-time password (OTP) to complete your login or verification process:</p>
      <div style="margin: 30px auto; text-align: center;">
        <p style="font-size: 32px; font-weight: bold; color: #001F3F; letter-spacing: 5px;">${otp}</p>
      </div>
      <p style="color: #666;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
    </div>

    <div style="padding: 15px 20px; text-align: center; font-size: 12px; color: #999;">
      FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#" style="color: #999;">Terms</a> &nbsp;•&nbsp; <a href="#" style="color: #999;">Privacy</a>
    </div>

  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendEmailVerification({ email, verificationLink }) {
  if (!email || !verificationLink) throw new Error('Valid email and verification link are required');
  const mailOptions = {
    from: `"FOREMADE Support" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: 'Welcome to FOREMADE - Verify Your Email',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Registration Confirmation</title>
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0;">

    <div style="background-color: #001F3F; padding: 20px;">
      <h1 style="margin: 0; color: white; font-size: 22px;">FOREMADE<br><span style="font-size: 14px; color: #cccccc;">MARKETPLACE</span></h1>
    </div>

    <div style="padding: 30px 20px 10px;">
      <h2 style="margin-top: 0; color: #333;">Welcome to FOREMADE!</h2>
      <p style="color: #666;">Thanks for signing up. To complete your registration and start using your FOREMADE account, please verify your email address below.</p>
    </div>

    <div style="padding: 20px; text-align: center;">
      <a href="${verificationLink}" style="background-color: #001F3F; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email</a>
    </div>

    <div style="padding: 20px; border-top: 1px solid #eee;">
      <p style="font-size: 14px; color: #666; text-align: center;">If you did not create an account with FOREMADE, you can safely ignore this email.</p>
    </div>

    <div style="padding: 15px 20px; text-align: center; font-size: 12px; color: #999;">
      FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="#" style="color: #999;">Terms</a> &nbsp;•&nbsp; <a href="#" style="color: #999;">Privacy</a>
    </div>

  </div>
</body>
</html>`,
  };
  await transporter.sendMail(mailOptions);
}

async function sendProductBumpReceipt({ email, duration, amount, startTime, endTime, currency = 'NGN' }) {
  if (!email || !/\S+@\S+\.\S+/.test(email) || !duration || !amount || !startTime || !endTime) {
    throw new Error('Valid email, duration, amount, startTime, and endTime are required');
  }
  let currencySymbol = '₦';
  if (currency.toUpperCase() === 'GBP') currencySymbol = '£';
  else if (currency.toUpperCase() === 'USD') currencySymbol = '$';
  else if (currency.toUpperCase() === 'EUR') currencySymbol = '€';
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Product Bump Activated - FOREMADE Marketplace',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Product Bump Receipt</title>
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #e0e0e0;">

    <div style="background-color: #001F3F; padding: 20px;">
      <h1 style="margin: 0; color: white; font-size: 22px;">FOREMADE<br><span style="font-size: 14px; color: #cccccc;">MARKETPLACE</span></h1>
    </div>

    <div style="padding: 30px 20px 10px;">
      <h2 style="margin-top: 0; color: #1a73e8;">Product Bump Activated</h2>
      <p style="color: #666;">Your product bump is now active!</p>
      <p style="color: #666;">Duration: <strong>${duration}</strong></p>
      <p style="color: #666;">Amount: <strong>${currencySymbol}${amount.toFixed(2)}</strong></p>
      <p style="color: #666;">Start: <strong>${startTime}</strong></p>
      <p style="color: #666;">End: <strong>${endTime}</strong></p>
    </div>

    <div style="padding: 20px;">
      <p style="font-size: 14px; color: #333;">If you have questions, please contact our support team for assistance.</p>
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
  if (!email) throw new Error('Valid email is required');
  const mailOptions = {
    from: `"FOREMADE" <${process.env.EMAIL_USER || 'no-reply@foremade.com'}>`,
    to: email,
    subject: 'Membership Revoked - FOREMADE Marketplace',
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
</html>`,
  };
  await transporter.sendMail(mailOptions);
}
async function sendSellerOrderNotification({ email, orderId, items, total, currency, shippingDetails }) {

  if (!email || !/\S+@\S+\.\S+/.test(email) || !orderId || !items || !total || !currency || !shippingDetails) {
    throw new Error('Valid email, orderId, items, total, currency, and shippingDetails are required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items must be a non-empty array');
  }
  if (typeof total !== 'number' || total <= 0) {
    throw new Error('Total must be a positive number');
  }
  if (!['NGN', 'GBP'].includes(currency.toUpperCase())) {
    throw new Error('Invalid currency');
  }
  if (!shippingDetails.name || !shippingDetails.address || !shippingDetails.city || !shippingDetails.postalCode || !shippingDetails.country || !shippingDetails.phone) {
    throw new Error('Invalid shipping details: missing name, address, city, postalCode, country, or phone');
  }
  for (const item of items) {
    if (!item.name || !item.quantity || !item.price || !item.imageUrls || !Array.isArray(item.imageUrls)) {
      throw new Error('Invalid item structure: missing name, quantity, price, or imageUrls');
    }
  }

  let currencySymbol = currency.toUpperCase() === 'NGN' ? '₦' : '£';
  const shippingAddressHtml = `
    <p>${shippingDetails.name}</p>
    <p>${shippingDetails.address}</p>
    <p>${shippingDetails.city}, ${shippingDetails.postalCode}</p>
    <p>${shippingDetails.country}</p>
    <p>Phone: ${shippingDetails.phone}</p>
  `;

  const mailOptions = {
    from: `"FOREMADE Seller Notifications" <${process.env.SALES_EMAIL || process.env.EMAIL_USER || 'sales@foremade.com'}>`,
    to: email,
    subject: `New Order Received #${orderId} - FOREMADE Marketplace`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOREMADE Marketplace - New Seller Order</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .items { text-align: left; margin-bottom: 20px; }
    .items div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ccc; }
    .items img { max-width: 60px; height: auto; margin-right: 10px; }
    .shipping { text-align: left; margin-bottom: 20px; }
    .shipping p { margin: 5px 0; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
    .button { display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div class="content">
    <h2>New Order Received #${orderId}</h2>
    <p>Congratulations! You have received a new order. Please review the details below and prepare the items for shipment.</p>
    <div class="items">
      <h3>Items Ordered</h3>
      ${items.map(item => `
        <div>
          <div style="display: flex; align-items: center;">
            <img src="${item.imageUrls[0] || 'https://via.placeholder.com/60'}" alt="${item.name}" />
            <span>${item.name} (Qty: ${item.quantity})</span>
          </div>
          <span>${currencySymbol}${item.price.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
    <div class="shipping">
      <h3>Shipping Details</h3>
      ${shippingAddressHtml}
    </div>
    <div class="payment">
      <h3>Order Summary</h3>
      <p>Order Total: ${currencySymbol}${total.toFixed(2)}</p>
    </div>
    <p>Please process the order promptly. Visit your seller dashboard for more details:</p>
    <a href="https://foremade.com/seller/dashboard" class="button">Go to Seller Dashboard</a>
  </div>
  <div class="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="https://foremade.com/terms-conditions">Terms</a> &nbsp;•&nbsp; <a href="https://foremade.com/privacy-policy">Privacy</a></p>
    <p>Questions? Contact us at <a href="mailto:support@foremade.com">support@foremade.com</a></p>
  </div>
</body>
</html>`
  };
  await transporter.sendMail(mailOptions);
}

async function sendInactiveUserReminder({ email, name }) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new Error('Valid email is required');
  }

  const userName = name || 'there';

  const mailOptions = {
    from: `"FOREMADE" <${process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@foremade.com'}>`,
    to: email,
    subject: `We Miss You at FOREMADE Marketplace!`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We Miss You - FOREMADE Marketplace</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #000000; }
    .header { background-color: #000000; text-align: center; padding: 20px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .content { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; text-align: center; }
    .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
    .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #666666; }
    .footer a { color: #000000; text-decoration: none; margin: 0 10px; }
    .button { display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
  </style>
</head>
<body>
  <div className="header">
    <h1>FOREMADE MARKETPLACE</h1>
  </div>
  <div className="content">
    <h2>We Miss You, ${userName}!</h2>
    <p>It’s been a while since you last visited FOREMADE Marketplace. We’ve got new arrivals and exclusive deals waiting for you!</p>
    <p>Come back and explore what’s new:</p>
    <a href="https://foremade.com/products" className="button">Shop Now</a>
    <p>Discover unique products and connect with passionate sellers at FOREMADE.</p>
  </div>
  <div className="footer">
    <p>FOREMADE Marketplace © 2025 &nbsp;•&nbsp; <a href="https://foremade.com/terms">Terms</a> &nbsp;•&nbsp; <a href="https://foremade.com/privacy">Privacy</a></p>
    <p>Questions? Contact us at <a href="mailto:support@foremade.com">support@foremade.com</a></p>
  </div>
</body>
</html>`
  };
  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendDispatchEmail,
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
  sendSellerOrderNotification,
  sendInactiveUserReminder,
  // sendProSellerRequestReceived, // Removed as it is not defined
  sendProductBumpReceipt,
  sendMembershipRevokedEmail,
  sendAllTemplatesTo,
  sendYouthEmpowermentApplication,
};