const { db } = require('./firebaseConfig');
const { collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp } = require('firebase/firestore');

async function rejectAllStuckTransactions() {
  try {
    // Query all transactions with status 'pending_otp'
    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('type', '==', 'Withdrawal'),
      where('status', '==', 'pending_otp')
    );
    const querySnapshot = await getDocs(transactionsQuery);

    if (querySnapshot.empty) {
      console.log('No stuck transactions found with status: pending_otp');
      return;
    }

    console.log(`Found ${querySnapshot.size} stuck transactions`);

    // Process each stuck transaction
    for (const docSnapshot of querySnapshot.docs) {
      const transactionId = docSnapshot.id;
      const transactionData = docSnapshot.data();
      const { sellerId, amount } = transactionData;

      // Reject the transaction
      const transactionRef = docSnapshot.ref;
      await updateDoc(transactionRef, {
        status: 'Rejected',
        updatedAt: serverTimestamp(),
      });

      // Fetch seller data for notification
      const sellerRef = doc(db, 'sellers', sellerId);
      const sellerSnap = await getDoc(sellerRef);
      if (sellerSnap.exists() && sellerSnap.data().email) {
        await addDoc(collection(db, 'notifications'), {
          type: 'payout_rejected',
          message: `Payout request of ₦${amount.toFixed(2)} for transaction ${transactionId} rejected due to OTP removal`,
          createdAt: new Date(),
          details: { transactionId, sellerId, email: sellerSnap.data().email },
        });
      }

      console.log(`Rejected transaction ${transactionId} for seller ${sellerId}`);
    }

    console.log('All stuck transactions rejected successfully');
  } catch (error) {
    console.error('Error rejecting stuck transactions:', error);
  }
}

rejectAllStuckTransactions().catch(console.error);