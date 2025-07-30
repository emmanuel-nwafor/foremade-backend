require('dotenv').config();
const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { setupMiddleware } = require('./middleware');
const productRoutes = require('./productRoutes');
const paymentRoutes = require('./paymentRoutes');
const sellerRoutes = require('./sellerRoutes');
const emailRoutes = require('./emailRoutes');
const bankRoutes = require('./bankRoutes');
const recaptchaRoutes = require('./recaptchaRoutes');
const uploadRoutes = require('./uploadRoutes');
const proSellerRoutes = require('./proSellerRoutes');
const authRoutes = require('./authRoutes');
const registerRoutes = require('./registerRoutes');

const app = express();

// Add JSON body parsing middleware
app.use(express.json());

// Setup other middleware
setupMiddleware(app);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Foremade API',
      version: '1.0.0',
      description: 'API documentation for Foremade e-commerce platform with Firebase Authentication',
      contact: {
        name: 'Foremade Support',
        email: 'support@foremade.com'
      }
    },
    servers: [
      {
        url: process.env.DOMAIN || 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Firebase ID token from client authentication'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./*.js'] // Path to the API docs
};

const specs = swaggerJsdoc(swaggerOptions);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Foremade API Documentation'
}));

// Routes handlers
app.use(authRoutes);
app.use(productRoutes);
app.use(paymentRoutes);
app.use(sellerRoutes);
app.use(emailRoutes);
app.use(bankRoutes);
app.use(registerRoutes);
app.use(recaptchaRoutes);
app.use(uploadRoutes);
app.use(proSellerRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation available at: http://localhost:${PORT}/api-docs`);
});