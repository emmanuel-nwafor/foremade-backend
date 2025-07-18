backend/
├── routes/
│   ├── wallet.js          # Wallet endpoints
│   ├── product.js        # Product/email endpoints (optional)
│   ├── payment.js        # Payment endpoints (optional)
│   └── onboarding.js     # Onboarding/bank endpoints (optional)
├── middleware/
│   └── upload.js         # Multer config
├── config/
│   └── firebase.js       # Firebase initialization
│   └── cloudinary.js     # Cloudinary config
├── server.js             # Main app, mounts routes
├── package.json
├── node_modules/
└── .env