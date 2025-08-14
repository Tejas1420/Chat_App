// service worker file must be served at site root or appropriate scope
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: AIzaSyARs3DqyyA_HOux9zsMA99TQL1qlzDNjcY,
  authDomain: "chat-app-4x3l.firebaseapp.com",
  projectId: "chat-app-4x3l",
  storageBucket: "chat-app-4x3l.firebasestorage.app",
  messagingSenderId: "260344155778",
  appId: "1:260344155778:web:a05a000e206fab3b492e9b",
  measurementId: "G-MC8697E17X"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notification = payload.notification || payload.data || {};
  const title = notification.title || 'New message';
  const options = {
    body: notification.body || '',
    icon: '/icon-192.png'
  };
  self.registration.showNotification(title, options);
});

// made by tejas singh
