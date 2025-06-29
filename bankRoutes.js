const express = require('express');
const axios = require('axios');
const soap = require('soap');
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
// /verify-bank-account endpoint
router.post('/verify-bank-account', async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Missing accountNumber or bankCode' });
    }

    console.log('Verifying account with PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Key is set' : 'Key is NOT set');
    console.log('Request URL:', `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Paystack Response Status:', response.status);
    console.log('Paystack Response Data:', response.data);

    if (response.data.status) {
      res.json({
        status: 'success',
        accountName: response.data.data.account_name,
      });
    } else {
      res.status(400).json({ error: 'Could not verify account', message: response.data.message });
    }
  } catch (error) {
    console.error('Bank verification error:', error);
    res.status(500).json({
      error: 'Failed to verify bank account',
      details: error.response?.data?.message || error.message,
    });
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
// /fetch-banks endpoint
router.get('/fetch-banks', async (req, res) => {
  try {
    console.log('Fetching banks with PAYSTACK_SECRET_KEY:', process.env.PAYSTACK_SECRET_KEY ? 'Key is set' : 'Key is NOT set');
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Paystack Bank Fetch Response Status:', response.status);
    console.log('Paystack Bank Fetch Data:', response.data);

    if (response.data.status) {
      res.json(response.data.data);
    } else {
      throw new Error('Failed to fetch banks');
    }
  } catch (error) {
    console.error('Fetch banks error:', error);
    res.status(500).json({ error: 'Failed to fetch banks', details: error.response?.data?.message || error.message });
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