const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection, increment } = require('firebase/firestore');
const router = express.Router();

router.post('/onboard-seller', async (req, res) => {
  try {
    const { userId, fullName, bankCode, accountNumber, country, email, iban, bankName, idNumber } = req.body;
    if (!userId || !country || !fullName) {
      return res.status(400).json({ error: 'Missing userId, country, or fullName', details: { userId, country, fullName } });
    }

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found', details: { userId } });
    }
    if (userSnap.data().role === 'Seller' || userSnap.data().isOnboarded) {
      return res.status(400).json({ error: 'User is already a Seller', details: { userId } });
    }

    const sellerData = {
      fullName,
      country,
      idNumber: country === 'United Kingdom' ? idNumber : '',
      bankName: '',
      bankCode: country === 'Nigeria' ? bankCode : '',
      accountNumber: country === 'Nigeria' ? accountNumber : '',
      iban: country === 'United Kingdom' ? iban : '',
      email: country === 'United Kingdom' ? email : userSnap.data().email,
      paystackRecipientCode: '',
      stripeAccountId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (country === 'Nigeria') {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ error: 'Bank code and account number required for Nigeria', details: { bankCode, accountNumber } });
      }
      const verifyResponse = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!verifyResponse.data.status) {
        return res.status(400).json({ error: `Failed to verify bank account: ${verifyResponse.data.message}`, details: { accountNumber, bankCode } });
      }
      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: fullName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!recipientResponse.data.status) {
        return res.status(400).json({ error: `Failed to create Paystack recipient: ${recipientResponse.data.message}`, details: { accountNumber, bankCode } });
      }
      sellerData.paystackRecipientCode = recipientResponse.data.data.recipient_code;
      try {
        const bankResponse = await axios.get('https://api.paystack.co/bank', {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const bank = bankResponse.data.data.find(b => b.code === bankCode);
        sellerData.bankName = bank ? bank.name : 'Unknown Bank';
      } catch (bankError) {
        console.warn('Failed to fetch bank name:', bankError.message);
        sellerData.bankName = 'Unknown Bank';
      }
    } else if (country === 'United Kingdom') {
      if (!iban || !bankName || !email || !idNumber) {
        return res.status(400).json({ error: 'Missing iban, bankName, email, or idNumber for UK', details: { iban, bankName, email, idNumber } });
      }
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.DOMAIN}/seller-onboarding?status=failed`,
        return_url: `${process.env.DOMAIN}/seller-onboarding?status=success`,
        type: 'account_onboarding',
      });
      sellerData.stripeAccountId = account.id;
      sellerData.bankName = bankName;
      await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });
      await updateDoc(userRef, {
        role: 'Seller',
        isOnboarded: false,
        updatedAt: new Date().toISOString(),
      });
      return res.json({
        success: true,
        stripeAccountId: account.id,
        redirectUrl: accountLink.url,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country', details: { country } });
    }

    await setDoc(doc(db, 'sellers', userId), sellerData, { merge: true });
    await updateDoc(userRef, {
      role: 'Seller',
      isOnboarded: true,
      updatedAt: new Date().toISOString(),
    });

    await addDoc(collection(db, 'notifications'), {
      type: 'seller_onboarded',
      message: `Seller onboarded: ${fullName} (${country})`,
      createdAt: new Date(),
      details: { userId, country, paystackRecipientCode: sellerData.paystackRecipientCode },
    });

    res.json({
      success: true,
      recipientCode: sellerData.paystackRecipientCode || undefined,
      stripeAccountId: sellerData.stripeAccountId || undefined,
    });
  } catch (error) {
    console.error('Onboarding error:', error.message, { userId: req.body.userId, country: req.body.country });
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message });
  }
});

router.post('/complete-purchase', async (req, res) => {
  try {
    const { sellerId, amount, productPrice } = req.body;
    if (!sellerId || !amount || !productPrice) {
      return res.status(400).json({ error: 'Missing sellerId, amount, or productPrice', details: { sellerId, amount, productPrice } });
    }

    const fees = amount - productPrice;
    const sellerEarnings = productPrice;

    const walletRef = doc(db, 'wallets', sellerId);
    await setDoc(walletRef, {
      availableBalance: increment(sellerEarnings),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await addDoc(collection(db, 'transactions'), {
      sellerId,
      type: 'Sale',
      amount: sellerEarnings,
      fees,
      status: 'Completed',
      createdAt: serverTimestamp(),
    });

    res.json({ status: 'success', message: 'Purchase completed, seller credited to available balance' });
  } catch (error) {
    console.error('Purchase error:', error.message, { sellerId: req.body.sellerId });
    res.status(500).json({ error: 'Failed to complete purchase', details: error.message });
  }
});

router.post('/initiate-seller-payout', async (req, res) => {
  try {
    const { sellerId, amount, accountDetails } = req.body;
    if (!sellerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing sellerId or invalid amount', details: { sellerId, amount } });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found', details: { sellerId } });
    }
    const wallet = walletSnap.data();
    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance', details: { availableBalance: wallet.availableBalance, amount } });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(400).json({ error: 'Seller not found', details: { sellerId } });
    }
    const seller = sellerSnap.data();

    const transactionReference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transactionDoc = await addDoc(collection(db, 'transactions'), {
      sellerId,
      type: 'Withdrawal',
      description: `Withdrawal request for ${transactionReference} - Awaiting Admin Approval`,
      amount,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: serverTimestamp(),
      reference: transactionReference,
      country: seller.country,
      paystackRecipientCode: seller.paystackRecipientCode,
      bankName: accountDetails?.bankName || seller.bankName || 'N/A',
      accountNumber: accountDetails?.accountNumber || seller.accountNumber || 'N/A',
    });

    await addDoc(collection(db, 'notifications'), {
      type: 'payout_request',
      message: `New payout request of ₦${amount.toFixed(2)} from seller ${sellerId}`,
      createdAt: new Date(),
      details: { transactionId: transactionDoc.id, sellerId },
    });

    res.json({
      status: 'success',
      transactionId: transactionDoc.id,
      message: 'Withdrawal request submitted, awaiting admin approval',
    });
  } catch (error) {
    console.error('Payout initiation error:', error.message, { sellerId: req.body.sellerId, amount: req.body.amount });
    res.status(500).json({ error: 'Failed to initiate seller payout', details: error.message });
  }
});

router.post('/approve-payout', async (req, res) => {
  try {
    console.log('=== Approve Payout Request ===', req.body);
    const { transactionId, sellerId, amount } = req.body;
    console.log('Parsed request:', { transactionId, sellerId, amount });

    if (!transactionId || !sellerId || !amount) {
      console.log('Validation failed: Missing required fields', { transactionId, sellerId, amount });
      return res.status(400).json({ error: 'Missing transactionId, sellerId, or amount', details: { transactionId, sellerId, amount } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    console.log('Transaction check:', { exists: transactionSnap.exists(), transactionId });
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }
    const transactionData = transactionSnap.data();
    console.log('Transaction data:', { sellerId: transactionData.sellerId, status: transactionData.status, amount: transactionData.amount });
    if (transactionData.sellerId !== sellerId) {
      return res.status(400).json({ error: 'Seller ID does not match transaction', details: { transactionId, sellerId, transactionSellerId: transactionData.sellerId } });
    }
    if (transactionData.status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid transaction status', details: { transactionId, status: transactionData.status } });
    }
    if (transactionData.amount !== amount) {
      return res.status(400).json({ error: 'Requested amount does not match transaction amount', details: { requested: amount, transaction: transactionData.amount } });
    }
    const { country, paystackRecipientCode } = transactionData;

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    console.log('Seller check:', { exists: sellerSnap.exists(), sellerId });
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found', details: { sellerId } });
    }
    const sellerData = sellerSnap.data();

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    console.log('Wallet check:', { exists: walletSnap.exists(), sellerId });
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found', details: { sellerId } });
    }
    const walletData = walletSnap.data();
    console.log('Wallet data:', { availableBalance: walletData.availableBalance });
    if (walletData.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance for payout', details: { availableBalance: walletData.availableBalance, amount } });
    }

    if (country === 'Nigeria') {
      const recipientCode = paystackRecipientCode || sellerData.paystackRecipientCode;
      console.log('Paystack validation:', { recipientCode });
      if (!recipientCode) {
        return res.status(400).json({ error: 'Seller has not completed Paystack onboarding', details: { sellerId, paystackRecipientCode } });
      }

      const balanceResponse = await axios.get('https://api.paystack.co/balance', {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }).catch(err => {
        console.log('Paystack balance error:', err.message, { stack: err.stack });
        throw new Error(`Paystack balance check failed: ${err.message}`);
      });
      const availableBalance = balanceResponse.data.data[0].balance / 100;
      console.log('Paystack balance:', { availableBalance });
      if (availableBalance < amount) {
        return res.status(400).json({ error: 'Insufficient Paystack balance for transfer', details: { availableBalance, amount } });
      }

      const response = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: `Payout for transaction ${transactionId}`,
          currency: 'NGN',
          metadata: { transactionId },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      ).catch(err => {
        console.log('Paystack transfer error:', err.response?.data || err.message, { stack: err.stack });
        throw new Error(`Paystack transfer failed: ${err.message}`);
      });

      if (response.data.status && ['success', 'pending'].includes(response.data.data.status)) {
        await updateDoc(walletRef, {
          availableBalance: increment(-amount),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(transactionRef, {
          status: 'Approved',
          transferReference: response.data.data.reference,
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'notifications'), {
          type: 'payout_completed',
          message: `Payout of ₦${amount.toFixed(2)} for transaction ${transactionId} completed`,
          createdAt: new Date(),
          details: { transactionId, sellerId, email: sellerData.email },
        });
        return res.json({
          status: 'success',
          message: 'Payout processed and credited to seller account in real-time',
          transferReference: response.data.data.reference,
        });
      } else {
        throw new Error(response.data.message || 'Transfer initiation failed');
      }
    } else if (country === 'United Kingdom') {
      const stripeAccountId = sellerData.stripeAccountId;
      console.log('Stripe validation:', { stripeAccountId });
      if (!stripeAccountId) {
        return res.status(400).json({ error: 'Seller has not completed Stripe onboarding', details: { sellerId, stripeAccountId } });
      }
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        destination: stripeAccountId,
        transfer_group: transactionId,
      }).catch(err => {
        console.log('Stripe transfer error:', err.message, { stack: err.stack });
        throw new Error(`Stripe transfer failed: ${err.message}`);
      });
      await updateDoc(walletRef, {
        availableBalance: increment(-amount),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(transactionRef, {
        status: 'Approved',
        transferId: transfer.id,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_completed',
        message: `Payout of £${amount.toFixed(2)} for transaction ${transactionId} completed`,
        createdAt: new Date(),
        details: { transactionId, sellerId, email: sellerData.email },
      });
      return res.json({
        status: 'success',
        message: 'Payout processed for UK seller in real-time',
        transferId: transfer.id,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country', details: { country } });
    }
  } catch (error) {
    console.error('=== Payout Approval Error ===', error.message, { transactionId: req.body.transactionId, sellerId: req.body.sellerId, stack: error.stack });
    return res.status(500).json({ error: 'Failed to approve payout', details: error.message });
  }
});

router.post('/reject-payout', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    console.log('Reject payout request:', { transactionId, sellerId });
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId', details: { transactionId, sellerId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }
    if (transactionSnap.data().sellerId !== sellerId) {
      return res.status(400).json({ error: 'Seller ID does not match transaction', details: { transactionId, sellerId, transactionSellerId: transactionSnap.data().sellerId } });
    }
    if (transactionSnap.data().status !== 'Pending') {
      return res.status(400).json({ error: 'Invalid or non-pending transaction', details: { transactionId, status: transactionSnap.data().status } });
    }
    const { amount } = transactionSnap.data();

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found', details: { sellerId } });
    }

    await updateDoc(transactionRef, {
      status: 'Rejected',
      updatedAt: serverTimestamp(),
    });
    await updateDoc(walletRef, {
      availableBalance: increment(amount),
      updatedAt: serverTimestamp(),
    });

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists() && sellerSnap.data().email) {
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_rejected',
        message: `Payout request of ₦${amount.toFixed(2)} for transaction ${transactionId} rejected and refunded to wallet`,
        createdAt: new Date(),
        details: { transactionId, sellerId, email: sellerSnap.data().email },
      });
    }

    return res.json({
      status: 'success',
      message: 'Payout rejected and amount refunded to seller wallet',
    });
  } catch (error) {
    console.error('Payout rejection error:', error.message, { transactionId: req.body.transactionId, sellerId: req.body.sellerId });
    return res.status(500).json({ error: 'Failed to reject payout', details: error.message });
  }
});

router.post('/paystack-webhook', async (req, res) => {
  try {
    const event = req.body;
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha512', secret);
    const expectedSignature = hmac.update(JSON.stringify(event)).digest('hex');
    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature:', { received: signature, expected: expectedSignature });
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    if (event.event === 'transfer.success') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        const { sellerId, amount } = transactionSnap.data();
        await updateDoc(transactionRef, {
          status: 'Approved',
          transferReference: event.data.reference,
          updatedAt: serverTimestamp(),
        });
        const sellerRef = doc(db, 'sellers', sellerId);
        const sellerSnap = await getDoc(sellerRef);
        if (sellerSnap.exists() && sellerSnap.data().email) {
          await addDoc(collection(db, 'notifications'), {
            type: 'payout_completed',
            message: `Payout of ₦${amount.toFixed(2)} for transaction ${event.data.metadata.transactionId} completed`,
            createdAt: new Date(),
            details: { transactionId: event.data.metadata.transactionId, sellerId, email: sellerSnap.data().email },
          });
        }
      }
    } else if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        const { sellerId, amount } = transactionSnap.data();
        await updateDoc(transactionRef, {
          status: 'Failed',
          updatedAt: serverTimestamp(),
          transferReference: event.data.reference,
          failureReason: event.data.reason || 'Unknown reason',
        });
        const walletRef = doc(db, 'wallets', sellerId);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          await updateDoc(walletRef, {
            availableBalance: increment(amount),
            updatedAt: serverTimestamp(),
          });
        }
        const sellerRef = doc(db, 'sellers', sellerId);
        const sellerSnap = await getDoc(sellerRef);
        if (sellerSnap.exists() && sellerSnap.data().email) {
          await addDoc(collection(db, 'notifications'), {
            type: 'payout_failed',
            message: `Payout of ₦${amount.toFixed(2)} for transaction ${event.data.metadata.transactionId} failed and refunded to wallet`,
            createdAt: new Date(),
            details: { transactionId: event.data.metadata.transactionId, sellerId, email: sellerSnap.data().email },
          });
        }
      }
    }

    return res.status(200).json({ status: 'success', message: 'Webhook received' });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

router.post('/delete-transaction', async (req, res) => {
  try {
    const { transactionId } = req.body;
    console.log('Delete transaction request:', { transactionId });

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required', details: { transactionId } });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    console.log('Transaction exists:', transactionSnap.exists);

    if (!transactionSnap.exists) {
      return res.status(404).json({ error: 'Transaction not found', details: { transactionId } });
    }

    await deleteDoc(transactionRef);
    console.log('Transaction deleted:', transactionId);
    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error.message, { transactionId: req.body.transactionId, stack: error.stack });
    res.status(500).json({ error: 'Failed to delete transaction', details: error.message });
  }
});

module.exports = router;