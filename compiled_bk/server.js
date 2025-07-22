require('dotenv').config();
const express = require('express');
const { setupMiddleware } = require('./middleware');
const paymentRoutes = require('./paymentRoutes');
const sellerRoutes = require('./sellerRoutes');
const emailRoutes = require('./emailRoutes');
const bankRoutes = require('./bankRoutes');
const recaptchaRoutes = require('./recaptchaRoutes');
const uploadRoutes = require('./uploadRoutes');

const app = express();

// Setup middleware
setupMiddleware(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Routes handlers
app.use(paymentRoutes);
app.use(sellerRoutes);
app.use(emailRoutes);
app.use(bankRoutes);
app.use(recaptchaRoutes);
app.use(uploadRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});