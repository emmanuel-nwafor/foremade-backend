const express = require('express');
const { db } = require('./firebaseConfig');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, addDoc, collection } = require('firebase/firestore');
const router = express.Router();

router.post('/onboard-seller', async (req, res) => {
  try {
    const { userId, fullName, bankCode, accountNumber, country, email, iban, bankName, idNumber } = req.body;
    if (!userId || !country || !fullName) {
      return res.status(400).json({ error: 'Missing userId, country, or fullName' });
    }

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userSnap.data().role === 'Seller' || userSnap.data().isOnboarded) {
      return res.status(400).json({ error: 'User is already a Seller' });
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
        return res.status(400).json({ error: 'Bank code and account number required for Nigeria' });
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
        return res.status(400).json({ error: `Failed to verify bank account: ${verifyResponse.data.message}` });
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
        return res.status(400).json({ error: `Failed to create Paystack recipient: ${recipientResponse.data.message}` });
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
        return res.status(400).json({ error: 'Missing iban, bankName, email, or idNumber for UK' });
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
      return res.status(400).json({ error: 'Unsupported country' });
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
    console.error('Onboarding error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to onboard seller', details: error.message });
  }
});

router.post('/complete-purchase', async (req, res) => {
  try {
    const { sellerId, amount, productPrice } = req.body;
    if (!sellerId || !amount || !productPrice) {
      return res.status(400).json({ error: 'Missing sellerId, amount, or productPrice' });
    }

    const fees = amount - productPrice;
    const sellerEarnings = productPrice;

    const walletRef = doc(db, 'wallets', sellerId);
    await setDoc(walletRef, {
      availableBalance: firebase.firestore.FieldValue.increment(sellerEarnings),
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

    res.json({ status: 'success', message: 'Purchase completed, seller credited' });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: 'Failed to complete purchase', details: error.message });
  }
});

router.post('/initiate-seller-payout', async (req, res) => {
  try {
    const { sellerId, amount } = req.body;
    if (!sellerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing sellerId or invalid amount' });
    }

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(400).json({ error: 'Wallet not found' });
    }
    const wallet = walletSnap.data();
    if (wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance' });
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(400).json({ error: 'Seller not found' });
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
    console.error('Payout initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate seller payout', details: error.message });
  }
});

router.post('/toggle-otp', async (req, res) => {
  try {
    const { otpEnabled } = req.body;
    if (typeof otpEnabled !== 'boolean') {
      return res.status(400).json({ error: 'otpEnabled must be a boolean' });
    }

    const adminRef = doc(db, 'admin', 'settings');
    await setDoc(adminRef, { otpEnabled }, { merge: true });

    res.json({
      status: 'success',
      message: `OTP for transfers ${otpEnabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error('Toggle OTP error:', error);
    res.status(500).json({ error: 'Failed to toggle OTP', details: error.message });
  }
});

router.post('/approve-payout', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transactionData = transactionSnap.data();
    if (transactionData.status !== 'Pending' && transactionData.status !== 'pending_otp') {
      return res.status(400).json({ error: 'Invalid transaction status' });
    }
    const { amount, country, paystackRecipientCode } = transactionData;

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (!sellerSnap.exists()) {
      return res.status(404).json({ error: 'Seller not found' });
    }
    const sellerData = sellerSnap.data();

    const walletRef = doc(db, 'wallets', sellerId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      return res.status(404).json({ error: 'Seller wallet not found' });
    }
    const walletData = walletSnap.data();
    if (walletData.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient available balance for payout' });
    }

    if (country === 'Nigeria') {
      const recipientCode = paystackRecipientCode || sellerData.paystackRecipientCode;
      if (!recipientCode) {
        return res.status(400).json({ error: 'Seller has not completed Paystack onboarding' });
      }

      const balanceResponse = await axios.get('https://api.paystack.co/balance', {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const availableBalance = balanceResponse.data.data[0].balance / 100;
      if (availableBalance < amount) {
        return res.status(400).json({ error: 'Insufficient Paystack balance for transfer' });
      }

      const adminRef = doc(db, 'admin', 'settings');
      const adminSnap = await getDoc(adminRef);
      const otpEnabled = adminSnap.exists() && adminSnap.data().otpEnabled !== false;

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
          timeout: 15000,
        }
      );

      console.log('Approve payout Paystack response:', JSON.stringify(response.data, null, 2));

      if (otpEnabled && response.data.status && response.data.data.status === 'otp') {
        await updateDoc(transactionRef, {
          status: 'pending_otp',
          transferCode: response.data.data.transfer_code,
          updatedAt: serverTimestamp(),
        });
        const adminEmail = adminSnap.exists() ? adminSnap.data().email : 'emitexc.e.o1@gmail.com';
        await addDoc(collection(db, 'notifications'), {
          type: 'payout_otp',
          message: `OTP sent for payout approval of ₦${amount.toFixed(2)} for transaction ${transactionId}`,
          createdAt: new Date(),
          details: { transactionId, sellerId, adminEmail },
        });
        res.status(200).json({
          status: 'success',
          message: `OTP sent to admin email for transaction ${transactionId}`,
          transferCode: response.data.data.transfer_code,
        });
      } else if (response.data.status && response.data.data.status === 'success') {
        await updateDoc(walletRef, {
          availableBalance: walletData.availableBalance - amount,
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
        res.json({
          status: 'success',
          message: 'Payout processed and credited to seller account',
          transferReference: response.data.data.reference,
        });
      } else {
        throw new Error(response.data.message || 'Transfer initiation failed');
      }
    } else if (country === 'United Kingdom') {
      const stripeAccountId = sellerData.stripeAccountId;
      if (!stripeAccountId) {
        return res.status(400).json({ error: 'Seller has not completed Stripe onboarding' });
      }
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        destination: stripeAccountId,
        transfer_group: transactionId,
      });
      await updateDoc(walletRef, {
        availableBalance: walletData.availableBalance - amount,
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
      res.json({
        status: 'success',
        message: 'Payout processed for UK seller',
        transferId: transfer.id,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported country' });
    }
  } catch (error) {
    console.error('Payout approval error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to approve payout', details: error.response?.data?.message || error.message });
  }
});

router.post('/reject-payout', async (req, res) => {
  try {
    const { transactionId, sellerId } = req.body;
    if (!transactionId || !sellerId) {
      return res.status(400).json({ error: 'Missing transactionId or sellerId' });
    }

    const transactionRef = doc(db, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists() || !['Pending', 'pending_otp'].includes(transactionSnap.data().status)) {
      return res.status(400).json({ error: 'Invalid or non-pending transaction' });
    }

    await updateDoc(transactionRef, {
      status: 'Rejected',
      updatedAt: serverTimestamp(),
    });

    const sellerRef = doc(db, 'sellers', sellerId);
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists() && sellerSnap.data().email) {
      await addDoc(collection(db, 'notifications'), {
        type: 'payout_rejected',
        message: `Payout request of ₦${transactionSnap.data().amount.toFixed(2)} for transaction ${transactionId} rejected`,
        createdAt: new Date(),
        details: { transactionId, sellerId, email: sellerSnap.data().email },
      });
    }

    res.json({
      status: 'success',
      message: 'Payout rejected',
    });
  } catch (error) {
    console.error('Payout rejection error:', error);
    res.status(500).json({ error: 'Failed to reject payout', details: error.message });
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

    console.log('Received Paystack webhook:', event);

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
        const walletRef = doc(db, 'wallets', sellerId);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          await updateDoc(walletRef, {
            availableBalance: walletSnap.data().availableBalance - amount,
            updatedAt: serverTimestamp(),
          });
        }
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
        console.log(`Transfer ${event.data.reference} succeeded for transaction ${event.data.metadata.transactionId}`);
      }
    } else if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      const transactionRef = doc(db, 'transactions', event.data.metadata.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        await updateDoc(transactionRef, {
          status: 'Failed',
          updatedAt: serverTimestamp(),
          transferReference: event.data.reference,
          failureReason: event.data.reason || 'Unknown reason',
        });
        console.log(`Transfer ${event.data.reference} failed for transaction ${event.data.metadata.transactionId}: ${event.data.reason}`);
      }
    }

    res.status(200).json({ status: 'success', message: 'Webhook received' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

module.exports = router;