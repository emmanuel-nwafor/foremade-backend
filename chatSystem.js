const express = require('express');
const router = express.Router();

const emailRegex = /\S+@\S+\.\S+/;
const phoneRegex = /(\+\d{1,3}\s?)?(\d{3}[-\.\s]?\d{3}[-\.\s]?\d{4})/;
const addressRegex = /(\d+\s+\w+\s+(street|st|avenue|ave|road|rd|blvd|lane|ln|drive|dr))/i;
const restrictedPhrases = ['whatsapp me', 'call me', 'email me', 'contact me at'];

/**
 * @swagger
 * /api/chat/validate:
 *   post:
 *     summary: Validate a chat message
 *     description: Checks if a chat message contains sensitive information (emails, phone numbers, addresses, or restricted phrases)
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: The chat message to validate
 *                 example: "Is this item available?"
 *               productId:
 *                 type: string
 *                 description: Optional product ID for context
 *                 example: "abc123"
 *     responses:
 *       200:
 *         description: Message is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   description: Whether the message is valid
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: Success message
 *                   example: "Message is valid"
 *       400:
 *         description: Invalid or sensitive message content
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message
 *                   example: "Message contains restricted content"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message
 *                   example: "Failed to validate message"
 *                 details:
 *                   type: string
 *                   description: Detailed error information
 *                   example: "Internal server error"
 */
router.post('/validate', async (req, res) => {
  try {
    const { text, productId } = req.body;

    // Validate input
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'Message is empty' });
    }

    // Optional: Validate productId
    if (productId && typeof productId !== 'string') {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Check for sensitive info
    if (
      emailRegex.test(text) ||
      phoneRegex.test(text) ||
      addressRegex.test(text) ||
      restrictedPhrases.some((phrase) => text.toLowerCase().includes(phrase))
    ) {
      return res.status(400).json({ error: 'Message contains restricted content' });
    }

    res.status(200).json({ valid: true, message: 'Message is valid' });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      error: 'Failed to validate message',
      details: error.message,
    });
  }
});

module.exports = router;