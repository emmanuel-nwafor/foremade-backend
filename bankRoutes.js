const express = require('express');
const axios = require('axios');
const soap = require('soap');
const { db } = require('./firebaseConfig');
const { doc, setDoc, getDoc } = require('firebase/firestore');
const router = express.Router();

/**
 * @swagger
 * /verify-bank-account:
 *   post:
 *     summary: Verify bank account (Nigeria)
 *     description: Verify a Nigerian bank account using Paystack API
 *     tags: [Banking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *               - bankCode
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number
 *                 example: "0123456789"
 *               bankCode:
 *                 type: string
 *                 description: Bank code from Paystack
 *                 example: "044"
 *     responses:
 *       200:
 *         description: Bank account verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 accountName:
 *                   type: string
 *                   description: Account holder's name
 *                   example: "John Doe"
 *       400:
 *         description: Invalid request or account not found
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
router.post('/verify-bank-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Account number and bank code required' });
    }
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );
    if (!response.data.status) {
      throw new Error('Account verification failed');
    }
    res.json(response.data.data);
  } catch (error) {
    console.error('Verify bank error:', error);
    res.status(500).json({ error: 'Failed to verify bank account', details: error.response?.data?.message || error.message });
  }
});

/**
 * @swagger
 * /fetch-banks:
 *   get:
 *     summary: Get list of banks (Nigeria)
 *     description: Retrieve all Nigerian banks from Paystack API
 *     tags: [Banking]
 *     responses:
 *       200:
 *         description: Banks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Bank ID
 *                     example: 1
 *                   name:
 *                     type: string
 *                     description: Bank name
 *                     example: "Access Bank"
 *                   code:
 *                     type: string
 *                     description: Bank code
 *                     example: "044"
 *                   active:
 *                     type: boolean
 *                     description: Whether bank is active
 *                     example: true
 *                   country:
 *                     type: string
 *                     description: Country code
 *                     example: "Nigeria"
 *                   currency:
 *                     type: string
 *                     description: Currency code
 *                     example: "NGN"
 *                   type:
 *                     type: string
 *                     description: Bank type
 *                     example: "nuban"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/fetch-banks', async (req, res) => {
  try {
    console.log('Fetching banks, PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY); // Debug
    const response = await axios.get('https://api.paystack.co/bank?country=nigeria', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    if (!response.data.status) {
      throw new Error('Failed to fetch banks');
    }
    res.json(response.data.data);
  } catch (error) {
    console.error('Fetch banks error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch banks', details: error.message });
  }
});

// Admin bank endpoint
router.post('/admin-bank', async (req, res) => {
  try {
    const { country, bankCode, accountNumber, iban, bankName } = req.body;
    console.log('Received payload:', req.body); // Debug

    // Validate required fields
    if (country === 'Nigeria' && (!bankCode || !accountNumber)) {
      return res.status(400).json({ error: 'Bank code and account number required for Nigeria' });
    }
    if (country === 'United Kingdom' && (!iban || !bankName)) {
      return res.status(400).json({ error: 'IBAN and bank name required for UK' });
    }

    // Prepare data object, excluding undefined fields
    const data = { country };
    if (country === 'Nigeria' && bankCode && accountNumber) {
      data.bankCode = bankCode;
      data.accountNumber = accountNumber;
    }
    if (country === 'United Kingdom' && iban && bankName) {
      data.iban = iban;
      data.bankName = bankName;
    }

    await setDoc(doc(db, 'admin', 'bank'), data, { merge: true });
    res.json({ message: 'Admin bank details saved' });
  } catch (error) {
    console.error('Admin bank error:', error);
    res.status(500).json({ error: 'Failed to save admin bank details', details: error.message });
  }
});

/**
 * @swagger
 * /verify-business-reg-number:
 *   post:
 *     summary: Verify business registration number (Nigeria & UK)
 *     description: Verify a business registration number using Dojah (Nigeria) or Companies House (UK)
 *     tags: [Banking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - country
 *               - regNumber
 *             properties:
 *               country:
 *                 type: string
 *                 enum: [NG, UK]
 *                 description: Country code (NG for Nigeria, UK for United Kingdom)
 *                 example: "NG"
 *               regNumber:
 *                 type: string
 *                 description: Business registration number
 *                 example: "1234567"
 *     responses:
 *       200:
 *         description: Business verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   description: Verification result
 *       400:
 *         description: Invalid request or unsupported country
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Verification failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/verify-business-reg-number', async (req, res) => {
  const { country, regNumber } = req.body;
  try {
    if (!country || !regNumber) {
      return res.status(400).json({ error: 'country and regNumber are required' });
    }
    if (country === 'NG') {
      // Nigeria: Dojah
      const response = await axios.post(
        'https://api.dojah.io/api/v1/kyc/business/lookup',
        { country: 'NG', registration_number: regNumber },
        { headers: { 'AppId': process.env.DOJAH_APP_ID, 'Authorization': process.env.DOJAH_SECRET } }
      );
      return res.json({ status: 'success', data: response.data });
    } else if (country === 'UK') {
      // UK: Companies House
      const response = await axios.get(
        `https://api.company-information.service.gov.uk/company/${regNumber}`,
        { auth: { username: process.env.COMPANIES_HOUSE_API_KEY, password: '' } }
      );
      return res.json({ status: 'success', data: response.data });
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Verification failed', details: error.response?.data || error.message });
  }
});

/**
 * @swagger
 * /verify-tax-number:
 *   post:
 *     summary: Verify tax reference number (Nigeria & UK)
 *     description: Verify a tax reference number using Dojah (Nigeria TIN) or VIES SOAP API (UK VAT)
 *     tags: [Banking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - country
 *               - taxNumber
 *             properties:
 *               country:
 *                 type: string
 *                 enum: [NG, UK]
 *                 description: Country code (NG for Nigeria, UK for United Kingdom)
 *                 example: "NG"
 *               taxNumber:
 *                 type: string
 *                 description: Tax reference number (TIN for Nigeria, VAT for UK)
 *                 example: "12345678"
 *     responses:
 *       200:
 *         description: Tax number verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   description: Verification result
 *       400:
 *         description: Invalid request or unsupported country
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Verification failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/verify-tax-number', async (req, res) => {
  const { country, taxNumber } = req.body;
  try {
    if (!country || !taxNumber) {
      return res.status(400).json({ error: 'country and taxNumber are required' });
    }
    if (country === 'NG') {
      // Nigeria: Dojah TIN lookup
      const response = await axios.post(
        'https://api.dojah.io/api/v1/kyc/tin/lookup',
        { country: 'NG', tin: taxNumber },
        { headers: { 'AppId': process.env.DOJAH_APP_ID, 'Authorization': process.env.DOJAH_SECRET } }
      );
      return res.json({ status: 'success', data: response.data });
    } else if (country === 'UK') {
      // UK: VIES SOAP API for VAT verification
      const vatNumber = taxNumber.replace(/\s+/g, '');
      
      const vatValid = await new Promise((resolve, reject) => {
        const url = 'http://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';
        
        soap.createClient(url, (err, client) => {
          if (err) {
            return reject(err);
          }
          
          client.checkVat({
            countryCode: 'GB',
            vatNumber: vatNumber
          }, (err, result) => {
            if (err) {
              return reject(err);
            }
            
            // VIES returns valid: true if VAT number is valid
            resolve(result && result.valid === true);
          });
        });
      });
      
      if (vatValid) {
        return res.json({ status: 'success', data: { isValid: true, vatNumber } });
      } else {
        return res.status(400).json({ error: 'Invalid VAT number', data: { isValid: false, vatNumber } });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Verification failed', details: error.response?.data || error.message });
  }
});

module.exports = router;