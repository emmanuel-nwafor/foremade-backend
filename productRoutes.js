const express = require('express');
const { db } = require('./firebaseConfig');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit, startAfter, serverTimestamp } = require('firebase/firestore');
const { authenticateFirebaseToken, optionalAuth } = require('./middleware');
const router = express.Router();

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     description: Retrieve all products with pagination, filtering, and sorting options
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of products per page
 *         example: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by product category
 *         example: "Electronics"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by product status
 *         example: "approved"
 *       - in: query
 *         name: sellerId
 *         schema:
 *           type: string
 *         description: Filter by seller ID
 *         example: "seller123"
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [price, createdAt, name]
 *           default: createdAt
 *         description: Sort field
 *         example: "price"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *         example: "desc"
 *       - in: header
 *         name: x-user-country
 *         schema:
 *           type: string
 *         description: User's country for currency conversion
 *         example: "GB"
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       price:
 *                         type: number
 *                       convertedPrice:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       formattedPrice:
 *                         type: string
 *                       category:
 *                         type: string
 *                       imageUrls:
 *                         type: array
 *                         items:
 *                           type: string
 *                       sellerId:
 *                         type: string
 *                       status:
 *                         type: string
 *                       isBumped:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalProducts:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/products', optionalAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      status, 
      sellerId, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    // Build query
    let productsQuery = collection(db, 'products');

    // Add filters
    if (status) {
      productsQuery = query(productsQuery, where('status', '==', status));
    }
    if (sellerId) {
      productsQuery = query(productsQuery, where('sellerId', '==', sellerId));
    }
    if (category) {
      productsQuery = query(productsQuery, where('category', '==', category));
    }

    // Add sorting
    productsQuery = query(productsQuery, orderBy(sortBy, sortOrder), limit(limitNum));

    const productsSnap = await getDocs(productsQuery);
    
    const products = [];
    productsSnap.forEach(doc => {
      const productData = doc.data();
      
      // Convert price to user's currency if available
      let convertedPrice = productData.price;
      let currency = 'NGN';
      let formattedPrice = `₦${productData.price.toLocaleString()}`;
      
      if (req.userCurrency && req.userCurrency.code !== 'NGN') {
        const { convertCurrency, formatCurrency } = require('./middleware');
        convertedPrice = convertCurrency(productData.price, 'NGN', req.userCurrency.code);
        currency = req.userCurrency.code;
        formattedPrice = formatCurrency(convertedPrice, req.userCurrency.code);
      }

      products.push({
        id: doc.id,
        ...productData,
        convertedPrice,
        currency,
        formattedPrice,
        createdAt: productData.createdAt?.toDate?.() || new Date()
      });
    });

    // Get total count for pagination
    const totalQuery = collection(db, 'products');
    const totalSnap = await getDocs(totalQuery);
    const totalProducts = totalSnap.size;
    const totalPages = Math.ceil(totalProducts / limitNum);

    res.status(200).json({
      status: 'success',
      products,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalProducts,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products', details: error.message });
  }
});

/**
 * @swagger
 * /api/products/{productId}:
 *   get:
 *     summary: Get product by ID
 *     description: Retrieve a specific product by its ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *         example: "product123"
 *       - in: header
 *         name: x-user-country
 *         schema:
 *           type: string
 *         description: User's country for currency conversion
 *         example: "GB"
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 product:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     price:
 *                       type: number
 *                     convertedPrice:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     formattedPrice:
 *                       type: string
 *                     category:
 *                       type: string
 *                     imageUrls:
 *                       type: array
 *                       items:
 *                         type: string
 *                     sellerId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     isBumped:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/products/:productId', optionalAuth, async (req, res) => {
  try {
    const { productId } = req.params;

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productSnap.data();

    // Convert price to user's currency if available
    let convertedPrice = productData.price;
    let currency = 'NGN';
    let formattedPrice = `₦${productData.price.toLocaleString()}`;
    
    if (req.userCurrency && req.userCurrency.code !== 'NGN') {
      const { convertCurrency, formatCurrency } = require('./middleware');
      convertedPrice = convertCurrency(productData.price, 'NGN', req.userCurrency.code);
      currency = req.userCurrency.code;
      formattedPrice = formatCurrency(convertedPrice, req.userCurrency.code);
    }

    // Increment view count
    await updateDoc(productRef, {
      views: (productData.views || 0) + 1,
      updatedAt: serverTimestamp()
    });

    res.status(200).json({
      status: 'success',
      product: {
        id: productSnap.id,
        ...productData,
        convertedPrice,
        currency,
        formattedPrice,
        createdAt: productData.createdAt?.toDate?.() || new Date()
      }
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product', details: error.message });
  }
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Add new product
 *     description: Create a new product listing (requires Firebase authentication)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - price
 *               - category
 *               - imageUrls
 *             properties:
 *               name:
 *                 type: string
 *                 description: Product name
 *                 example: "iPhone 13 Pro"
 *               description:
 *                 type: string
 *                 description: Product description
 *                 example: "Latest iPhone with advanced features"
 *               price:
 *                 type: number
 *                 description: Product price in NGN
 *                 example: 500000
 *               category:
 *                 type: string
 *                 description: Product category
 *                 example: "Electronics"
 *               imageUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of image URLs
 *                 example: ["https://example.com/image1.jpg", "https://example.com/image2.jpg"]
 *               videoUrl:
 *                 type: string
 *                 description: Product video URL (optional)
 *                 example: "https://example.com/video.mp4"
 *               specifications:
 *                 type: object
 *                 description: Product specifications
 *                 example: { "color": "Blue", "storage": "256GB", "condition": "New" }
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Product created successfully"
 *                 productId:
 *                   type: string
 *                   description: Generated product ID
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/api/products', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { name, description, price, category, imageUrls, videoUrl, specifications } = req.body;

    // Validate required fields
    if (!name || !description || !price || !category || !imageUrls) {
      return res.status(400).json({ error: 'Missing required fields: name, description, price, category, imageUrls' });
    }

    // Validate price
    if (typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    // Validate imageUrls
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: 'At least one image URL is required' });
    }

    // Create product document
    const productId = `product_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const productRef = doc(db, 'products', productId);
    
    const productData = {
      productId,
      name,
      description,
      price,
      category,
      imageUrls,
      videoUrl: videoUrl || '',
      specifications: specifications || {},
      sellerId: uid, // Use Firebase user ID
      status: 'pending',
      views: 0,
      isBumped: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(productRef, productData);

    console.log(`Product created successfully: ${productId} by user ${uid}`);
    res.status(201).json({
      status: 'success',
      message: 'Product created successfully',
      productId
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
});

/**
 * @swagger
 * /api/products/{productId}:
 *   put:
 *     summary: Update product
 *     description: Update an existing product (requires Firebase authentication)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *         example: "product123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Product name
 *                 example: "iPhone 13 Pro Max"
 *               description:
 *                 type: string
 *                 description: Product description
 *                 example: "Updated description"
 *               price:
 *                 type: number
 *                 description: Product price in NGN
 *                 example: 550000
 *               category:
 *                 type: string
 *                 description: Product category
 *                 example: "Electronics"
 *               imageUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of image URLs
 *               videoUrl:
 *                 type: string
 *                 description: Product video URL
 *               specifications:
 *                 type: object
 *                 description: Product specifications
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Product updated successfully"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Firebase token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - not the product owner
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/api/products/:productId', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { productId } = req.params;
    const { name, description, price, category, imageUrls, videoUrl, specifications } = req.body;

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productSnap.data();

    // Check if user owns the product
    if (productData.sellerId !== uid) {
      return res.status(403).json({ error: 'You can only update your own products' });
    }

    // Only allow updates if product is pending or rejected
    if (productData.status === 'approved') {
      return res.status(400).json({ error: 'Cannot update approved products' });
    }

    const updateData = {
      updatedAt: serverTimestamp()
    };

    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (price) {
      if (typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ error: 'Price must be a positive number' });
      }
      updateData.price = price;
    }
    if (category) updateData.category = category;
    if (imageUrls) {
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ error: 'At least one image URL is required' });
      }
      updateData.imageUrls = imageUrls;
    }
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl;
    if (specifications) updateData.specifications = specifications;

    await updateDoc(productRef, updateData);

    res.status(200).json({
      status: 'success',
      message: 'Product updated successfully'
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product', details: error.message });
  }
});

/**
 * @swagger
 * /api/products/{productId}:
 *   delete:
 *     summary: Delete product
 *     description: Delete a product (only if pending or rejected, requires Firebase authentication)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *         example: "product123"
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Product deleted successfully"
 *       401:
 *         description: Unauthorized - Firebase token required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - not the product owner or product is approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/api/products/:productId', authenticateFirebaseToken, async (req, res) => {
  try {
    const { uid } = req.user; // Firebase user ID
    const { productId } = req.params;

    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productSnap.data();

    // Check if user owns the product
    if (productData.sellerId !== uid) {
      return res.status(403).json({ error: 'You can only delete your own products' });
    }

    // Only allow deletion if product is pending or rejected
    if (productData.status === 'approved') {
      return res.status(403).json({ error: 'Cannot delete approved products' });
    }

    await deleteDoc(productRef);

    res.status(200).json({
      status: 'success',
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product', details: error.message });
  }
});

/**
 * @swagger
 * /api/products/categories:
 *   get:
 *     summary: Get product categories
 *     description: Retrieve all available product categories
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Electronics", "Fashion", "Home & Garden", "Sports", "Books"]
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/products/categories', async (req, res) => {
  try {
    // Predefined categories - you can make this dynamic by querying products
    const categories = [
      'Electronics',
      'Fashion',
      'Home & Garden',
      'Sports & Outdoors',
      'Books & Media',
      'Automotive',
      'Health & Beauty',
      'Toys & Games',
      'Food & Beverages',
      'Art & Collectibles',
      'Jewelry & Watches',
      'Pet Supplies',
      'Office & Business',
      'Baby & Kids',
      'Music & Instruments'
    ];

    res.status(200).json({
      status: 'success',
      categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories', details: error.message });
  }
});

module.exports = router; 