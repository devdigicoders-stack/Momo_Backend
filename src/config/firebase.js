const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;
let messaging = null;

try {
  let serviceAccount = null;

  // 1. First priority: Environment variable (Render / Production best practice)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (raw.startsWith('{')) {
        serviceAccount = JSON.parse(raw);
      } else {
        // Support base64 encoded JSON string to prevent newline issues in .env
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      }
      console.log('✅ Firebase Service Account loaded from environment variable');
    } catch (envErr) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT from .env:', envErr.message);
    }
  }

  // 2. Second priority: Local file fallback
  if (!serviceAccount) {
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      console.log('✅ Firebase Service Account loaded from local file');
    } else {
      console.warn('⚠️ Firebase service account file not found at:', serviceAccountPath);
    }
  }

  if (serviceAccount) {
    // Fix escaped newlines in private_key if present
    if (serviceAccount.private_key && serviceAccount.private_key.includes('\\n')) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    const existingApps = getApps();
    if (existingApps.length === 0) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      firebaseApp = existingApps[0];
    }
    messaging = getMessaging(firebaseApp);
    console.log('✅ Firebase Admin SDK initialized successfully for FCM notifications');
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization error:', error.message);
}

module.exports = {
  firebaseApp,
  messaging,
};
