router.post('/api/pro-seller', async (req, res) => {
  try {
    let uid;
    let idToken = req.headers.authorization?.split(' ')[1]; // Extract token if present

    // Handle authenticated user
    if (req.user && req.user.uid) {
      uid = req.user.uid;
    } else {
      // Handle unauthenticated or signup case
      if (idToken) {
        // Validate token if provided (e.g., from signup)
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
      } else {
        // Guest submission with temporary UID
        uid = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      }
    }

    const {
      businessName,
      businessType = 'Company',
      phone,
      phoneCode,
      address,
      website,
      description,
      categories,
      productLines,
      regNumber,
      taxRef,
      country,
      bankCode,
      email,
      manager,
      managerEmail,
      managerPhone,
      accountName,
      accountNumber,
      bankName,
      agree,
      testMode,
      ...rest
    } = req.body;

    if (!businessName || !businessType || !phone || !address) {
      return res.status(400).json({
        error: 'Missing required fields: businessName, businessType, phone, address'
      });
    }

    const proSellerId = `pro_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const proSellerData = {
      proSellerId,
      userId: uid,
      businessName,
      businessType,
      phone,
      phoneCode: phoneCode || '',
      address,
      website: website || '',
      description: [description, regNumber ? `Reg Number: ${regNumber}` : '', taxRef ? `Tax Ref: ${taxRef}` : '', country ? `Country: ${country}` : '', email ? `Email: ${email}` : '', manager ? `Manager: ${manager}` : '', managerEmail ? `Manager Email: ${managerEmail}` : '', managerPhone ? `Manager Phone: ${managerPhone}` : '', accountName ? `Account Name: ${accountName}` : '', accountNumber ? `Account Number: ${accountNumber}` : '', bankName ? `Bank Name: ${bankName}` : '', phoneCode ? `Phone Code: ${phoneCode}` : '', agree !== undefined ? `Agreed to terms: ${agree}` : ''].filter(Boolean).join(', '),
      categories: Array.isArray(categories) && categories.length > 0 ? categories : (Array.isArray(productLines) ? productLines : []),
      regNumber: regNumber || '',
      taxRef: taxRef || '',
      country: country || '',
      email: email || '',
      manager: manager || '',
      managerEmail: managerEmail || '',
      managerPhone: managerPhone || '',
      accountName: accountName || '',
      accountNumber: accountNumber || '',
      bankName: bankName || '',
      agree: agree !== undefined ? agree : false,
      status: 'pending',
      isActive: true,
      features: { analytics: true, productBumping: true, bulkUpload: true, prioritySupport: true },
      extraFields: { ...rest },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'proSellers', proSellerId), proSellerData);
    await setDoc(doc(db, 'proSellerApprovals', proSellerId), {
      proSellerId,
      userId: uid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`✅ Pro seller registered: ${proSellerId}`);
    return res.status(201).json({ status: 'success', proSellerId });
  } catch (error) {
    console.error('❌ Pro seller registration failed:', error);
    return res.status(500).json({ error: 'Failed to register pro seller', details: error.message });
  }
});