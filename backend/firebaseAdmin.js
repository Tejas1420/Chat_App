// firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // from Firebase console service accounts

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;

// made by tejas singh
