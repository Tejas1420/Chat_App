// put this in a <script type="module" src="/firebase-init.js"></script>
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: AIzaSyARs3DqyyA_HOux9zsMA99TQL1qlzDNjcY,
  authDomain: "chat-app-4x3l.firebaseapp.com",
  projectId: "chat-app-4x3l",
  storageBucket: "chat-app-4x3l.firebasestorage.app",
  messagingSenderId: "260344155778",
  appId: "1:260344155778:web:a05a000e206fab3b492e9b",
  measurementId: "G-MC8697E17X"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// call this once (e.g. after user login)
export async function registerForPush(userId) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission not granted');

    // VAPID public key from Firebase Console (Cloud Messaging -> Web Push certificates)
    const vapidKey = "BHfaqWDRNq1Gqb8Fj4uzpTAgWp7rpctSRmvveLsQYObw4Jh4d8qWqr4_QUljnYzRoi4Q8DjJ20cXqA40movy_7k";

    const token = await getToken(messaging, { vapidKey });
    console.log('FCM registration token:', token);

    // send token to your backend to save (associate with userId)
    await fetch('/api/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token, platform: 'web' })
    });
    return token;
  } catch (err) {
    console.error('registerForPush error', err);
    throw err;
  }
}

// optional: handle foreground messages
onMessage(messaging, (payload) => {
  console.log('Foreground message', payload);
  const notif = payload.notification || payload.data || {};
  // show an in-app toast or native Notification
  if (Notification.permission === 'granted') {
    new Notification(notif.title || 'New message', { body: notif.body || '', data: payload.data });
  }
});

// made by tejas singh