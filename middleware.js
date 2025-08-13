const cors = require('cors');
const multer = require('multer');
const express = require('express');
const { adminAuth } = require('./firebaseConfig');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, JPG, PNG, WEBP, GIF) and videos (MP4) are allowed.'));
    }
  },
});

// Currency configuration
const CURRENCY_CONFIG = {
  'NG': { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  'GB': { code: 'GBP', symbol: '£', name: 'British Pound' },
  'US': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'CA': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  'AU': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'EU': { code: 'EUR', symbol: '€', name: 'Euro' }
};

// Exchange rates (you should use a real API like exchangerate-api.com)
const EXCHANGE_RATES = {
  NGN: 1,      // Base currency
  GBP: 0.0017, // 1 NGN = 0.0017 GBP
  USD: 0.0021, // 1 NGN = 0.0021 USD
  CAD: 0.0028, // 1 NGN = 0.0028 CAD
  AUD: 0.0032, // 1 NGN = 0.0032 AUD
  EUR: 0.0019  // 1 NGN = 0.0019 EUR
};

// Currency detection middleware
const currencyMiddleware = (req, res, next) => {
  // Priority: 1. User preference, 2. IP geolocation, 3. Accept-Language header, 4. Default
  let userCurrency = req.headers['x-user-currency'];
  let userCountry = req.headers['x-user-country'];
  
  if (!userCurrency && !userCountry) {
    // Try to detect from Accept-Language header
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
      const countryMatch = acceptLanguage.match(/[a-z]{2}-([A-Z]{2})/i);
      if (countryMatch) {
        userCountry = countryMatch[1];
      }
    }
  }

  // Default to Nigeria if no country detected
  if (!userCountry) {
    userCountry = 'NG';
  }

  // Get currency config for country
  const currencyConfig = CURRENCY_CONFIG[userCountry] || CURRENCY_CONFIG['NG'];
  
  // Set currency info in request
  req.userCurrency = {
    country: userCountry,
    code: currencyConfig.code,
    symbol: currencyConfig.symbol,
    name: currencyConfig.name,
    exchangeRate: EXCHANGE_RATES[currencyConfig.code] || 1
  };

  next();
};

// Firebase Authentication middleware
const authenticateFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authorization header required. Format: Bearer <firebase_id_token>' 
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!adminAuth) {
      console.warn('Firebase Admin SDK not initialized. Skipping token verification.');
      // For development, you can use a simple token format
      if (idToken.startsWith('token_')) {
        const userId = idToken.split('_')[2];
        req.user = { uid: userId };
        return next();
      }
      return res.status(401).json({ error: 'Firebase Admin SDK not configured' });
    }

    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    req.user = decodedToken;
    
    console.log(`Authenticated user: ${decodedToken.uid}`);
    next();
    
  } catch (error) {
    console.error('Firebase authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: 'Token revoked. Please login again.' });
    }
    
    return res.status(401).json({ 
      error: 'Invalid authentication token',
      details: error.message 
    });
  }
};

// Optional authentication middleware (for routes that can work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      req.user = null;
      return next();
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!adminAuth) {
      // For development, handle simple token format
      if (idToken.startsWith('token_')) {
        const userId = idToken.split('_')[2];
        req.user = { uid: userId };
        return next();
      }
      req.user = null;
      return next();
    }

    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
    
  } catch (error) {
    console.warn('Optional authentication failed:', error.message);
    // Continue without authentication
    req.user = null;
    next();
  }
};

// Currency conversion utility
const convertCurrency = (amount, fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = EXCHANGE_RATES[fromCurrency] || 1;
  const toRate = EXCHANGE_RATES[toCurrency] || 1;
  
  // Convert to base currency (NGN) then to target currency
  const baseAmount = amount / fromRate;
  return baseAmount * toRate;
};

// Format currency utility
const formatCurrency = (amount, currencyCode, locale = 'en-NG') => {
  const currencyConfig = Object.values(CURRENCY_CONFIG).find(c => c.code === currencyCode);
  if (!currencyConfig) return `${amount}`;
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(amount);
};

const setupMiddleware = (app) => {
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-currency', 'x-user-country', 'x-user-id', 'x-user-email'],
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(currencyMiddleware);
};

module.exports = { 
  upload, 
  setupMiddleware, 
  currencyMiddleware, 
  authenticateFirebaseToken,
  optionalAuth,
  convertCurrency, 
  formatCurrency,
  CURRENCY_CONFIG,
  EXCHANGE_RATES
};