# Foremade Backend API

A comprehensive e-commerce backend API with Firebase authentication, multi-currency support, payment processing, and pro-seller features.

## 🔥 **Firebase Authentication Architecture**

This backend uses **Firebase Authentication exclusively** for user authentication:

- **Frontend**: Firebase Authentication (client-side)
- **Backend**: Firebase Admin SDK for token verification
- **Database**: Firebase Firestore for data storage

### **Authentication Flow**

1. **Frontend Login**: User logs in via Firebase Auth (email/password, Google, Facebook)
2. **Token Generation**: Firebase provides an ID token
3. **API Calls**: Frontend sends ID token in Authorization header
4. **Backend Verification**: Backend verifies token using Firebase Admin SDK
5. **Data Access**: Backend accesses Firestore data using verified user ID

### **Frontend Integration Example**

```javascript
// After Firebase login
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const auth = getAuth();
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Get ID token
    const idToken = await user.getIdToken();
    
    // Store token for API calls
    localStorage.setItem('firebaseToken', idToken);
  }
});

// API call with Firebase token
const makeApiCall = async () => {
  const token = localStorage.getItem('firebaseToken');
  
  const response = await fetch('http://localhost:5000/api/products', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-user-country': 'GB'
    }
  });
  
  return response.json();
};
```

## Features

- **Firebase Authentication**: Secure token-based authentication
- **Multi-Currency Support**: Automatic currency detection and conversion based on user location
- **Payment Processing**: Stripe (UK) and Paystack (Nigeria) integration
- **Pro-Seller Features**: Analytics, product bumping, bulk upload
- **File Upload**: Cloudinary integration for images and videos
- **Email Notifications**: Automated email system
- **API Documentation**: Swagger/OpenAPI documentation with ReDoc

## Currency Localization

The API automatically detects user location and converts prices to their local currency.

### Supported Currencies

| Country | Currency Code | Symbol | Name |
|---------|---------------|--------|------|
| Nigeria | NGN | ₦ | Nigerian Naira |
| United Kingdom | GBP | £ | British Pound |
| United States | USD | $ | US Dollar |
| Canada | CAD | C$ | Canadian Dollar |
| Australia | AUD | A$ | Australian Dollar |
| European Union | EUR | € | Euro |

### How Currency Detection Works

1. **User Preference**: Check `x-user-currency` header
2. **Country Detection**: Check `x-user-country` header
3. **Language Header**: Parse `Accept-Language` header
4. **Default**: Fallback to Nigeria (NGN)

### Usage Examples

#### React Native App
```javascript
// Set user's country in headers
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${firebaseToken}`,
  'x-user-country': 'GB', // or 'US', 'NG', etc.
  'x-user-currency': 'GBP' // optional, will be auto-detected
};

// Make API call
const response = await fetch('http://localhost:5000/get-product-price?price=50000', {
  headers
});

// Response will include converted price
// {
//   "originalPrice": 50000,
//   "convertedPrice": 85,
//   "currency": "GBP",
//   "symbol": "£",
//   "formattedPrice": "£85.00",
//   "country": "GB"
// }
```

#### Currency Conversion in Routes
```javascript
// In any route, access user's currency info
router.get('/products', (req, res) => {
  const userCurrency = req.userCurrency;
  const { convertCurrency, formatCurrency } = require('./middleware');
  
  // Convert product prices
  const convertedPrice = convertCurrency(originalPrice, 'NGN', userCurrency.code);
  const formattedPrice = formatCurrency(convertedPrice, userCurrency.code);
  
  res.json({
    price: convertedPrice,
    formattedPrice,
    currency: userCurrency.code
  });
});
```

## API Documentation

### Accessing Documentation

1. Start the server: `npm start`
2. Visit: `http://localhost:5000/api-docs`

### Adding Documentation to Routes

Use JSDoc comments with Swagger annotations:

```javascript
/**
 * @swagger
 * /api/example:
 *   post:
 *     summary: Example endpoint
 *     description: Detailed description
 *     tags: [Category]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *                 example: "value"
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/api/example', authenticateFirebaseToken, (req, res) => {
  // Route implementation
});
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server
PORT=5000
DOMAIN=http://localhost:5000

# Firebase (Client SDK)
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
FIREBASE_APP_ID=your_firebase_app_id

# Firebase Admin SDK (Optional - for production)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password

# Payments
STRIPE_SECRET_KEY=your_stripe_secret_key
PAYSTACK_SECRET_KEY=your_paystack_secret_key
ADMIN_STRIPE_ACCOUNT_ID=your_admin_stripe_account_id

# Security
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
```

## Installation & Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up Firebase Project**:
   - Create Firebase project at [Firebase Console](https://console.firebase.google.com)
   - Enable Authentication (Email/Password, Google, Facebook)
   - Enable Firestore Database
   - Get configuration from Project Settings

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual Firebase and other service values
   ```

4. **For Production (Optional)**:
   - Download service account key from Firebase Console
   - Set `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable

5. **Start the server**:
   ```bash
   npm start
   ```

6. **Access API documentation**:
   ```
   http://localhost:5000/api-docs
   ```

## API Endpoints

### Products
- `GET /api/products` - Get all products (with pagination, filtering, sorting)
- `GET /api/products/{productId}` - Get product by ID
- `POST /api/products` - Add new product (requires Firebase authentication)
- `PUT /api/products/{productId}` - Update product (requires Firebase authentication)
- `DELETE /api/products/{productId}` - Delete product (requires Firebase authentication)
- `GET /api/products/categories` - Get product categories
- `GET /get-product-price` - Get price in local currency

### Payments
- `POST /create-payment-intent` - Create Stripe payment (UK)
- `POST /initiate-paystack-payment` - Initiate Paystack payment (Nigeria)
- `POST /verify-paystack-payment` - Verify Paystack payment
- `POST /create-checkout-session` - Create Stripe checkout session

### Pro-Seller Features
- `POST /api/pro-seller` - Register as pro seller (requires Firebase authentication)
- `POST /api/pro-seller/onboard` - Onboard pro seller for payments (requires Firebase authentication)
- `GET /api/pro-seller/wallet` - Get pro seller wallet (requires Firebase authentication)
- `POST /api/pro-seller/initiate-payout` - Initiate pro seller payout (requires Firebase authentication)
- `GET /api/pro-seller/transactions` - Get pro seller transaction history (requires Firebase authentication)
- `POST /api/bump-product` - Bump product visibility (requires Firebase authentication)
- `GET /api/pro-seller-analytics` - Get seller analytics (requires Firebase authentication)
- `POST /api/bulk-upload-products` - Bulk product upload (requires Firebase authentication)

**Note**: Pro-sellers have **all regular seller capabilities** (product management, payments, wallet, transactions) **PLUS** advanced features like analytics, product bumping, and bulk upload.

### Seller Management
- `POST /onboard-seller` - Onboard seller for payments
- `POST /initiate-seller-payout` - Initiate seller payout
- `POST /approve-payout` - Approve seller payout
- `POST /reject-payout` - Reject seller payout

### File Upload
- `POST /upload` - Upload images/videos to Cloudinary

### Banking
- `POST /verify-bank-account` - Verify bank account (Nigeria)
- `GET /fetch-banks` - Get list of banks (Nigeria)

### Email Notifications
- `POST /send-product-approved-email` - Product approval notification
- `POST /send-product-rejected-email` - Product rejection notification
- `POST /send-order-confirmation` - Order confirmation email

### Security
- `POST /verify-recaptcha` - Verify reCAPTCHA token

## React Native Integration

### Authentication Setup
```javascript
// Initialize Firebase in your React Native app
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "your_api_key",
  authDomain: "your_project.firebaseapp.com",
  projectId: "your_project_id",
  // ... other config
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Login function
const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const token = await user.getIdToken();
    
    // Store token
    await AsyncStorage.setItem('firebaseToken', token);
    
    return user;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

// API call helper
const apiCall = async (endpoint, options = {}) => {
  const token = await AsyncStorage.getItem('firebaseToken');
  
  const response = await fetch(`http://localhost:5000${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-user-country': 'GB', // Set user's country
      ...options.headers
    }
  });
  
  return response.json();
};
```

### Product Management
```javascript
// Get all products
const getProducts = async (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return apiCall(`/api/products?${queryString}`);
};

// Add product
const addProduct = async (productData) => {
  return apiCall('/api/products', {
    method: 'POST',
    body: JSON.stringify(productData)
  });
};

// Update product
const updateProduct = async (productId, productData) => {
  return apiCall(`/api/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(productData)
  });
};
```

### Currency Headers
```javascript
// Set user location in your React Native app
const setUserLocation = async () => {
  try {
    // Get user's location (you can use expo-location or similar)
    const location = await Location.getCurrentPositionAsync({});
    
    // Reverse geocode to get country
    const address = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude
    });
    
    const country = address[0]?.countryCode || 'NG';
    
    // Store in AsyncStorage for future requests
    await AsyncStorage.setItem('userCountry', country);
  } catch (error) {
    console.log('Location error:', error);
  }
};

// Use in API calls
const makeApiCall = async () => {
  const userCountry = await AsyncStorage.getItem('userCountry') || 'NG';
  
  const response = await fetch('http://localhost:5000/api/products', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firebaseToken}`,
      'x-user-country': userCountry
    }
  });
  
  return response.json();
};
```

### Pro-Seller Features
```javascript
// Register as pro seller
const registerProSeller = async (userData) => {
  return apiCall('/api/pro-seller', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
};

// Onboard for payments
const onboardProSeller = async (paymentData) => {
  return apiCall('/api/pro-seller/onboard', {
    method: 'POST',
    body: JSON.stringify(paymentData)
  });
};

// Get wallet
const getProSellerWallet = async () => {
  return apiCall('/api/pro-seller/wallet');
};

// Initiate payout
const initiateProSellerPayout = async (payoutData) => {
  return apiCall('/api/pro-seller/initiate-payout', {
    method: 'POST',
    body: JSON.stringify(payoutData)
  });
};

// Get transactions
const getProSellerTransactions = async (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return apiCall(`/api/pro-seller/transactions?${queryString}`);
};

// Get analytics
const getAnalytics = async () => {
  return apiCall('/api/pro-seller-analytics');
};

// Bump product
const bumpProduct = async (productId, duration) => {
  return apiCall('/api/bump-product', {
    method: 'POST',
    body: JSON.stringify({ productId, bumpDuration: duration })
  });
};

// Bulk upload products
const bulkUploadProducts = async (products) => {
  return apiCall('/api/bulk-upload-products', {
    method: 'POST',
    body: JSON.stringify({ products })
  });
};
```

## Exchange Rates

**Note**: The current implementation uses static exchange rates. For production, integrate with a real-time exchange rate API like:
- [exchangerate-api.com](https://exchangerate-api.com)
- [fixer.io](https://fixer.io)
- [currencylayer.com](https://currencylayer.com)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your changes with proper documentation
4. Submit a pull request

## License

This project is licensed under the ISC License. 