Now unto a new problem.
The signup is not secure bro, I want to make it more secure bro.
1. The recent signup which is part of the codes I'll be sharing with you shortly, is frontend only, and i like it that way bro, let it be frontend only, I want the signup logic to be frontend just the way it is, but let us implement like an OTP, for security. Now when users signs up, don't create an endpoint register, let the registration just be frontend only like i said before, but when they signup, an email should be sent to their account telling them to verify the OTP. For example: A user signs up filling put all necessary fields first name, last name, email phone number and password, an OTP should be sent to the persons email the one they just field above for verification and security.
2. In the login page, I'll share a file also named auth routes in the file i want modifications of role based system, in the auth routes.js When users login, that is users that their emails are not above in the auth routes, redirect them to this route /profile, but if otherwise, redirect them to this route /admin/dashboard

Here are my codes.
authRoutes.js: const express = require('express');
const { doc, getDoc, setDoc, addDoc, collection } = require('firebase/firestore');
const { db } = require('./firebaseConfig');
const router = express.Router();

const ADMIN_EMAILS = [
  'echinecherem729@gmail.com', 
  'emitexc.e.o1@gmail.com', 
  'info@foremade.com', 
  'support@foremade.com',
];

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     description: Register a user, assign Buyer role by default, and redirect to profile
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *               - username
 *               - uid
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               phoneNumber:
 *                 type: string
 *                 example: "+2341234567890"
 *               username:
 *                 type: string
 *                 example: "johndoe"
 *               uid:
 *                 type: string
 *                 description: Firebase Auth UID
 *                 example: "user123"
 *     responses:
 *       200:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered, redirecting to profile"
 *                 role:
 *                   type: string
 *                   example: "Buyer"
 *                 redirectUrl:
 *                   type: string
 *                   example: "/profile"
 *       400:
 *         description: Invalid request data
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
// router.post('/register', async (req, res) => {
//   const { email, firstName, lastName, phoneNumber, username, uid } = req.body;

//   try {
//     if (!email || !firstName || !lastName || !username || !uid) {
//       return res.status(400).json({ error: 'Missing required fields' });
//     }

//     const role = ADMIN_EMAILS.includes(email) ? 'Admin' : 'Buyer';

//     const userRef = doc(db, 'users', uid);
//     const userData = {
//       email,
//       name: `${firstName} ${lastName}`,
//       username,
//       phoneNumber: phoneNumber || '',
//       role,
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     };
//     await setDoc(userRef, userData, { merge: true });

//     await addDoc(collection(db, 'notifications'), {
//       type: 'user_signup',
//       message: `New user signed up: ${email} as ${role}`,
//       createdAt: new Date(),
//       details: { user_id: uid, email, role },
//     });

//     res.status(200).json({ message: 'User registered, redirecting to profile', role, redirectUrl: role === 'Admin' ? '/admin-dashboard' : '/profile' });
//   } catch (error) {
//     console.error('Registration error:', error);
//     res.status(500).json({ error: 'Registration failed: ' + error.message });
//   }
// });

router.use('/admin/*all', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || userSnap.data().role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed: ' + error.message });
  }
});

router.use('/seller/*all', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || !['Seller', 'Admin'].includes(userSnap.data().role)) {
      return res.status(403).json({ error: 'Access denied: Seller or Admin role required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed: ' + error.message });
  }
});

module.exports = router;

registerRoutes.js: const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db, adminAuth, adminDb } = require('./firebaseConfig');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Registration',
    text: `Your OTP is ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Email send error:', err);
    throw err;
  }
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => {
  const hasLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[_@!+=#$%^&*()[\]{}|;:,.<>?~`/-]/.test(password);
  console.log('Password validation:', { password, hasLength, hasLetter, hasNumber, hasSpecialChar });
  return hasLength && hasLetter && hasNumber && hasSpecialChar;
};

// Register endpoint with max debugging
router.post('/register', async (req, res) => {
  console.log('Request headers:', JSON.stringify(req.headers, null, 2)); // Log headers
  console.log('Raw request body:', JSON.stringify(req.body, null, 2)); // Log raw body
  if (!req.body || Object.keys(req.body).length === 0) {
    console.error('No body received in request. Headers:', JSON.stringify(req.headers));
    return res.status(400).json({ success: false, error: 'No data received' });
  }

  const { firstName, lastName, email, password, phoneNumber, username } = req.body;
  console.log('Destructured data:', { firstName, lastName, email, password, phoneNumber, username });

  try {
    if (!firstName?.trim()) throw new Error('First name is required.');
    if (!lastName?.trim()) throw new Error('Last name is required.');
    if (!validateEmail(email)) throw new Error('Invalid email format.');
    if (!password) throw new Error('Password is required.');
    if (!validatePassword(password)) throw new Error('Password must have 6+ chars, a letter, a number, and a special char.');

    const existingUser = await adminAuth.getUserByEmail(email).catch(err => {
      console.error('Firebase getUserByEmail error:', err);
      throw err;
    });
    if (existingUser) {
      console.log('Email already in use:', email);
      return res.status(400).json({ success: false, error: 'Email already in use. Log in instead.' });
    }

    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
    }).catch(err => {
      console.error('Firestore set OTP error:', err);
      throw err;
    });

    await sendOTPEmail(email, otp);
    console.log('OTP sent successfully for email:', email);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Registration endpoint error:', err.message || err);
    res.status(400).json({ success: false, error: err.message || 'Registration failed' });
  }
});

// Resend OTP endpoint
router.post('/resend-otp', async (req, res) => {
  console.log('Raw resend OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email) {
    console.error('No email received in resend OTP request');
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { email } = req.body;

  try {
    if (!validateEmail(email)) throw new Error('Invalid email format.');

    const otp = generateOTP();
    const otpDocRef = adminDb.collection('otps').doc(email);
    await otpDocRef.set({
      otp,
      expires: adminDb.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      createdAt: adminDb.FieldValue.serverTimestamp(),
    }).catch(err => {
      console.error('Firestore set OTP error:', err);
      throw err;
    });

    await sendOTPEmail(email, otp);
    console.log('New OTP sent successfully for email:', email);
    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to resend OTP.' });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp', async (req, res) => {
  console.log('Raw verify OTP request:', JSON.stringify(req.body, null, 2));
  if (!req.body || !req.body.email || !req.body.otp) {
    console.error('Missing email or OTP in verify request');
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  const { email, otp, firstName, lastName, password, phoneNumber, username } = req.body;

  try {
    if (!firstName?.trim()) throw new Error('First name is required.');
    if (!lastName?.trim()) throw new Error('Last name is required.');
    if (!validateEmail(email)) throw new Error('Invalid email format.');
    if (!otp) throw new Error('OTP is required.');
    if (!password) throw new Error('Password is required.');
    if (!validatePassword(password)) throw new Error('Password must have 6+ chars, a letter, a number, and a special char.');

    const otpDoc = await adminDb.collection('otps').doc(email).get().catch(err => {
      console.error('Firestore get OTP error:', err);
      throw err;
    });
    if (!otpDoc.exists || otpDoc.data().otp !== otp || otpDoc.data().expires.toDate() < new Date()) {
      console.log('Invalid or expired OTP for email:', email);
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: username,
    }).catch(err => {
      console.error('Firebase createUser error:', err);
      throw err;
    });

    const userData = {
      email,
      name: `${firstName} ${lastName}`,
      username,
      address: '',
      phoneNumber: phoneNumber || '',
      createdAt: new Date().toISOString(),
      uid: userRecord.uid,
      profileImage: null,
    };
    await adminDb.collection('users').doc(userRecord.uid).set(userData).catch(err => {
      console.error('Firestore set user data error:', err);
      throw err;
    });

    await adminDb.collection('notifications').add({
      type: 'user_signup',
      message: `New user signed up: ${email}`,
      createdAt: adminDb.FieldValue.serverTimestamp(),
      details: { user_id: userRecord.uid, email },
    }).catch(err => {
      console.error('Firestore add notification error:', err);
      throw err;
    });

    await adminDb.collection('otps').doc(email).delete().catch(err => {
      console.error('Firestore delete OTP error:', err);
      throw err;
    });
    await adminAuth.generateEmailVerificationLink(email).catch(err => {
      console.error('Firebase email verification link error:', err);
      throw err;
    });

    console.log('User created successfully for email:', email);
    res.json({ success: true, message: 'Account created successfully.' });
  } catch (err) {
    console.error('Verify OTP error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Account creation failed.' });
  }
});

module.exports = router;

Login.jsx:import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import logo from '../assets/logi.png';

const getFriendlyErrorMessage = (error) => {
  switch (error.code) {
    case 'auth/invalid-credential': return 'Invalid email or password.';
    case 'auth/wrong-password': return 'Incorrect password. Please try again.';
    case 'auth/user-not-found': return 'No account found with this email. Contact your admin.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/user-disabled': return 'This account has been disabled. Contact your admin.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    default: return 'An unexpected error occurred. Please try again.';
  }
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingFacebook, setLoadingFacebook] = useState(false);
  const navigate = useNavigate();
  const { state } = useLocation();

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  useEffect(() => {
    // Auto-fill email from Google sign-in
    const socialEmail = localStorage.getItem('socialEmail') || state?.email || '';
    if (socialEmail) {
      setEmail(socialEmail);
      setPasswordError('Use Google Sign-In for this account.');
    }
  }, [state]);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          const user = result.user;
          handleSocialLogin(user);
        }
      })
      .catch((err) => {
        setEmailError(getFriendlyErrorMessage(err));
        setLoadingGoogle(false);
        setLoadingFacebook(false);
      });
  }, []);

  const handleSocialLogin = async (user) => {
    try {
      const userDoc = doc(db, 'users', user.uid);
      const userSnapshot = await getDoc(userDoc);
      let userData;

      if (userSnapshot.exists()) {
        userData = userSnapshot.data();
      } else {
        // Create user document for social login if it doesn't exist
        const adminEmails = ['echinecherem729@gmail.com', 'emitexc.e.o1@gmail.com'];
        const role = adminEmails.includes(user.email) ? 'Admin' : 'Buyer';
        const displayName = user.displayName || '';
        const [firstName, lastName] = displayName.split(' ').length > 1 ? displayName.split(' ') : [displayName, ''];
        userData = {
          uid: user.uid,
          email: user.email,
          firstName: firstName || user.email.split('@')[0],
          lastName: lastName || '',
          username: user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 1000),
          phoneNumber: user.phoneNumber || '',
          role,
        };
        await setDoc(userDoc, userData);
      }

      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.removeItem('socialEmail'); // Cleanup
      const firstName = userData.firstName || userData.name?.split(' ')[0] || 'User';
      setSuccessMessage(`Welcome back, ${firstName}!`);
      setTimeout(() => {
        setLoadingGoogle(false);
        setLoadingFacebook(false);
        navigate(userData.role === 'Admin' ? '/admin-dashboard' : '/profile');
      }, 2000);
    } catch (err) {
      setEmailError(getFriendlyErrorMessage(err));
      setLoadingGoogle(false);
      setLoadingFacebook(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setEmailError('');
    setPasswordError('');
    setSuccessMessage('');
    setLoadingEmail(true);

    let hasError = false;
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setEmailError('Email is required.');
      hasError = true;
    } else if (!validateEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      hasError = true;
    }
    if (!trimmedPassword && !passwordError.includes('Google Sign-In')) {
      setPasswordError('Password is required.');
      hasError = true;
    }

    if (hasError) {
      setLoadingEmail(false);
      return;
    }

    try {
      await setPersistence(auth, browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
      const user = userCredential.user;

      const userDoc = doc(db, 'users', user.uid);
      const userSnapshot = await getDoc(userDoc);
      if (userSnapshot.exists()) {
        const userData = userSnapshot.data();
        localStorage.setItem('userData', JSON.stringify(userData));
        localStorage.removeItem('socialEmail'); // Cleanup
        const firstName = userData.firstName || userData.name?.split(' ')[0] || 'User';
        setSuccessMessage(`Welcome, ${firstName}!`);
        setTimeout(() => {
          setLoadingEmail(false);
          navigate(userData.role === 'Admin' ? '/admin-dashboard' : '/profile');
        }, 2000);
      } else {
        setEmailError('No account found. Contact your admin.');
        setLoadingEmail(false);
      }
    } catch (err) {
      setLoadingEmail(false);
      const errorMessage = getFriendlyErrorMessage(err);
      if (errorMessage.includes('email') || errorMessage.includes('account') || errorMessage.includes('valid')) {
        setEmailError(errorMessage);
      } else {
        setPasswordError(errorMessage);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setEmailError('');
    setPasswordError('');
    setSuccessMessage('');
    setLoadingGoogle(true);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithRedirect(auth, provider);
    } catch (err) {
      setLoadingGoogle(false);
      setEmailError(getFriendlyErrorMessage(err));
    }
  };

  const handleFacebookSignIn = async () => {
    setEmailError('');
    setPasswordError('');
    setSuccessMessage('');
    setLoadingFacebook(true);

    const provider = new FacebookAuthProvider();
    provider.setCustomParameters({ display: 'popup' });
    try {
      await signInWithRedirect(auth, provider);
    } catch (err) {
      setLoadingFacebook(false);
      setEmailError(getFriendlyErrorMessage(err));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full h-screen flex">
        <div
          className="hidden md:block md:w-1/2 h-full bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.pexels.com/photos/7621356/pexels-photo-7621356.jpeg?auto=compress&cs=tinysrgb&w=600')" }}
        >
          <div className="w-full h-full bg-black bg-opacity-40 flex flex-col justify-center items-center text-white p-8">
            <h1 className="text-3xl font-bold mb-4 flex items-center">
              Welcome to <img src={logo} alt="Logo" className="h-20 ml-2" />
            </h1>
            <p className="text-lg text-center">Where quality meets NEEDS!</p>
          </div>
        </div>
        <div className="w-full md:w-1/2 h-full p-9 flex flex-col justify-center bg-white">
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">Sign In</h2>
          <p className="text-gray-600 mb-6">
            Don’t have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:underline">
              Sign Up
            </Link>
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full p-3 border rounded-lg transition-all duration-300 ${
                  emailError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'
                }`}
                autoComplete="email"
                required
              />
              <label
                htmlFor="email"
                className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${
                  email ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''
                }`}
              >
                Email
              </label>
              {emailError && <p className="text-red-600 text-xs mt-1">{emailError}</p>}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full p-3 border rounded-lg transition-all duration-300 ${
                  passwordError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'
                }`}
                autoComplete="current-password"
                required
                disabled={passwordError.includes('Google Sign-In')}
              />
              <label
                htmlFor="password"
                className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${
                  password || passwordError.includes('Google Sign-In') ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''
                }`}
              >
                Password
              </label>
              <span
                className="absolute right-3 top-3 text-gray-500 cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
                style={{ display: passwordError.includes('Google Sign-In') ? 'none' : 'block' }}
              >
                <i className={`bx ${showPassword ? 'bx-hide' : 'bx-show'} text-xl`}></i>
              </span>
              {passwordError && <p className="text-red-600 text-xs mt-1">{passwordError}</p>}
            </div>
            {successMessage && <p className="text-green-600 text-xs mt-1">{successMessage}</p>}
            <button
              type="submit"
              className="w-full bg-slate-600 text-white p-3 rounded-lg hover:bg-blue-800 transition duration-200"
              disabled={loadingEmail || passwordError.includes('Google Sign-In')}
            >
              {loadingEmail ? 'Logging in...' : 'Sign In'}
            </button>
          </form>
          <p className="text-gray-600 mt-2">
            <Link to="/recover-password" className="hover:underline hover:text-blue-700">
              Forgot Password?
            </Link>
          </p>
          <div className="mt-6 text-center">
            <p className="text-gray-600 mb-4">Or continue with</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleGoogleSignIn}
                className="bg-white border border-gray-300 p-[17px] max-md:p-2 text-sm rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                disabled={loadingGoogle}
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 mr-2" />
                {loadingGoogle ? 'Processing...' : 'Google'}
              </button>
              <button
                onClick={handleFacebookSignIn}
                className="bg-white border border-gray-300 p-[17px] max-md:p-2 text-sm rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                disabled={loadingFacebook}
              >
                <img src="https://www.facebook.com/favicon.ico" alt="Facebook" className="w-5 h-5 mr-2" />
                {loadingFacebook ? 'Processing...' : 'Facebook'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Register.jsx:import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logi.png';

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => {
  const hasLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[_@!+=#$%^&*()[\]{}|;:,.<>?~`/-]/.test(password);
  return {
    isValid: hasLength && hasLetter && hasNumber && hasSpecialChar,
    errors: [
      !hasLength && 'Password needs 6+ chars.',
      !hasLetter && 'Password needs a letter.',
      !hasNumber && 'Password needs a number.',
      !hasSpecialChar && 'Password needs a special char (e.g., _, @, !).',
    ].filter(Boolean),
  };
};

const generateUsername = (firstName, lastName) => {
  const nameParts = [firstName, lastName].filter(part => part?.trim());
  const firstPart = nameParts[0]?.slice(0, 4).toLowerCase() || 'user';
  const secondPart = nameParts[1]?.slice(0, 3).toLowerCase() || '';
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const usernameBase = (firstPart + secondPart).replace(/[^a-z0-9]/g, '');
  return usernameBase + randomNum;
};

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [phoneNumberError, setPhoneNumberError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Register, 2: OTP Verification
  const [signupAttempts, setSignupAttempts] = useState(0);
  const navigate = useNavigate();

  // Get backend URL from environment variable
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  const validatePhoneNumber = (phoneNumber) => {
    if (!phoneNumber.trim()) return true;
    return /^\+\d{7,15}$/.test(phoneNumber);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setFirstNameError('');
    setLastNameError('');
    setEmailError('');
    setPasswordError('');
    setPhoneNumberError('');
    setOtpError('');
    setSuccessMessage('');
    setLoading(true);

    if (signupAttempts >= 9) {
      setEmailError('Too many attempts. Try later.');
      setLoading(false);
      return;
    }

    let hasError = false;
    if (!firstName.trim()) {
      setFirstNameError('First name required.');
      hasError = true;
    }
    if (!lastName.trim()) {
      setLastNameError('Last name required.');
      hasError = true;
    }
    if (!validateEmail(email)) {
      setEmailError('Invalid email format.');
      hasError = true;
    }
    if (!password) {
      setPasswordError('Password required.');
      hasError = true;
    } else {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        setPasswordError(passwordValidation.errors[0]);
        hasError = true;
      }
    }
    if (phoneNumber && !validatePhoneNumber(phoneNumber)) {
      setPhoneNumberError('Invalid phone (e.g., +1234567890).');
      hasError = true;
    }

    if (hasError) {
      setLoading(false);
      setSignupAttempts(prev => prev + 1);
      return;
    }

    try {
      const username = generateUsername(firstName, lastName);
      const response = await fetch(`${backendUrl}/register`, { // Removed /api prefix
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password, phoneNumber, username }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
        setStep(2); // Move to OTP verification step
      } else {
        setEmailError(data.error);
      }
    } catch (err) {
      setEmailError('Registration failed. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/resend-otp`, { // Removed /api prefix
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
      } else {
        setEmailError(data.error);
      }
    } catch (err) {
      setEmailError('Failed to resend OTP. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/verify-otp`, { // Removed /api prefix
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, firstName, lastName, password, phoneNumber, username: generateUsername(firstName, lastName) }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
        setTimeout(() => {
          setLoading(false);
          navigate('/login', { state: { email } });
        }, 3000);
      } else {
        setOtpError(data.error);
      }
    } catch (err) {
      setOtpError('Verification failed. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full h-screen flex">
        <div className="hidden md:block md:w-1/2 h-full bg-cover bg-center" style={{ backgroundImage: "url('https://i.pinimg.com/736x/f2/8c/a4/f28ca4118a46e68b6871946e65ab5665.jpg')" }}>
          <div className="w-full h-full bg-black bg-opacity-40 flex flex-col justify-center items-center text-white p-8">
            <h1 className="text-3xl font-bold mb-4 flex items-center">
              Join <img src={logo} alt="Formade logo" className="h-20 ml-2" />
            </h1>
            <p className="text-lg text-center">Where quality meets NEEDS!</p>
          </div>
        </div>
        <div className="w-full md:w-1/2 h-full p-9 flex flex-col justify-center bg-white">
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">Sign Up</h2>
          <p className="text-gray-600 mb-6">
            Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Sign In</Link>
          </p>
          {step === 1 && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="flex space-x-4 mb-4">
                <div className="relative w-1/2">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={`w-full p-3 border rounded-lg transition-all duration-300 ${firstNameError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'}`}
                    autoComplete="given-name"
                    required
                  />
                  <label
                    className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${firstName ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''}`}
                  >
                    First Name
                  </label>
                  {firstNameError && <p className="text-red-600 text-xs mt-1">{firstNameError}</p>}
                </div>
                <div className="relative w-1/2">
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={`w-full p-3 border rounded-lg transition-all duration-300 ${lastNameError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'}`}
                    autoComplete="family-name"
                    required
                  />
                  <label
                    className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${lastName ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''}`}
                  >
                    Last Name
                  </label>
                  {lastNameError && <p className="text-red-600 text-xs mt-1">{lastNameError}</p>}
                </div>
              </div>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full p-3 border rounded-lg transition-all duration-300 ${emailError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'}`}
                  autoComplete="email"
                  required
                />
                <label
                  className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${email ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''}`}
                >
                  Email
                </label>
                {emailError && (
                  <p className="text-red-600 text-xs mt-1">
                    {emailError}{' '}
                    {emailError.includes('already in use') && (
                      <Link to="/login" className="text-blue-600 hover:underline">Click here to login</Link>
                    )}
                  </p>
                )}
              </div>
              <div className="relative">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className={`w-full p-3 border rounded-lg transition-all duration-300 ${phoneNumberError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'}`}
                  autoComplete="tel"
                />
                <label
                  className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${phoneNumber ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''}`}
                >
                  Phone Number
                </label>
                {phoneNumberError && <p className="text-red-600 text-xs mt-1">{phoneNumberError}</p>}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full p-3 border rounded-lg transition-all duration-300 ${passwordError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'}`}
                  autoComplete="new-password"
                  required
                />
                <label
                  className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${password ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''}`}
                >
                  Password
                </label>
                <span
                  className="absolute right-3 top-3 text-gray-500 cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <i className={`bx ${showPassword ? 'bx-hide' : 'bx-show'} text-xl`}></i>
                </span>
                {passwordError && <p className="text-red-600 text-xs mt-1">{passwordError}</p>}
              </div>
              {successMessage && <p className="text-green-600 text-xs mb-4">{successMessage}</p>}
              <button
                type="submit"
                className="w-full bg-slate-600 text-white p-3 rounded-lg hover:bg-blue-800 transition duration-200"
                disabled={loading}
              >
                {loading ? 'Sending OTP...' : 'Sign Up'}
              </button>
            </form>
          )}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className={`w-full p-3 border rounded-lg transition-all duration-300 ${otpError ? 'border-red-500' : successMessage ? 'border-green-500' : 'border-gray-300'}`}
                  maxLength="6"
                  required
                />
                <label
                  className={`absolute left-3 top-3 text-gray-500 transition-all duration-300 transform origin-left pointer-events-none ${otp ? '-translate-y-6 scale-75 text-blue-500 bg-white px-1' : ''}`}
                >
                  OTP
                </label>
                {otpError && <p className="text-red-600 text-xs mt-1">{otpError}</p>}
              </div>
              <button
                type="submit"
                className="w-full bg-slate-600 text-white p-3 rounded-lg hover:bg-blue-800 transition duration-200"
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
              <p className="text-center text-gray-600">
                Didn’t receive OTP?{' '}
                <button
                  onClick={handleResendOtp}
                  className="text-blue-600 hover:underline"
                  disabled={loading}
                >
                  Resend OTP
                </button>
              </p>
              {successMessage && <p className="text-green-600 text-xs mb-4">{successMessage}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

I dont know if you get me ?