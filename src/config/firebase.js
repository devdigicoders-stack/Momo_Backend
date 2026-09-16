const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;
let messaging = null;

try {
  const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
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
  } else {
    console.warn('⚠️ Firebase service account file not found at:', serviceAccountPath);
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization error:', error.message);
}

module.exports = {
  firebaseApp,
  messaging,
};
