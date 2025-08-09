import express from "express";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import Message from "./models/Message.js";
import User from "./models/user.js";  // Make sure filenames have .js extension
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";

const serviceAccountPath = path.resolve("../../../../etc/secrets/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.static("public"));


dotenv.config();
const server = http.createServer(app);
const io = new Server(server);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

app.use(express.static(path.join(__dirname, "../frontend")));

// 🛡️ Sanitize function (stops <script> injection)
function sanitize(input) {
  if (typeof input !== "string") return input;
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const userTokens = {}; // in-memory storage, replace with DB in production

async function sendPushNotificationToAll(payload) {
  try {
    const users = await User.find({ fcmTokens: { $exists: true, $ne: [] } });
    const tokens = users.flatMap(user => user.fcmTokens);

    if (tokens.length === 0) {
      console.log('No tokens registered to send notifications');
      return;
    }

    const response = await admin.messaging().sendToDevice(tokens, payload);
    console.log('Push notification sent:', response);
  } catch (err) {
    console.error('Error sending push notification:', err);
  }
}


app.post('/api/register-token', async (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) return res.status(400).json({ error: 'Missing userId or token' });

  try {
    const user = await User.findOne({ username: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Add token only if not already present
    if (!user.fcmTokens.includes(token)) {
      user.fcmTokens.push(token);
      await user.save();
    }

    console.log(`Registered token for user ${userId}:`, token);
    res.json({ success: true });
  } catch (err) {
    console.error('Error registering token:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// 🛡️ Spam tracking
const userData = {};

io.on("connection", (socket) => {
  console.log("📶 A user connected");

  // 🌐 Detect client IPs
  const realIP = socket.handshake.headers["cf-connecting-ip"];
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  const address = socket.handshake.address;
  const ua = socket.handshake.headers["user-agent"] || "Unknown";

  console.log("🔍 Connection details:");
  console.log("cf-connecting-ip:", realIP || "None");
  console.log("x-forwarded-for:", forwarded || "None");
  console.log("handshake.address:", address || "None");
  console.log("   User-Agent:", ua);

  // 🟩 SIGN UP
  socket.on("sign up", async ({ username, password }) => {
    try {
      const exists = await User.findOne({ username });
      if (exists) return socket.emit("sign up fail", "❌ Username already taken");

      const newUser = new User({ username, password });
      await newUser.save();

      socket.emit("sign up success");
    } catch (err) {
      socket.emit("sign up fail", "❌ Server error during sign-up");
    }
  });

  // 🟦 SIGN IN
  socket.on("sign in", async ({ username, password }) => {
    try {
      const user = await User.findOne({ username });
      if (!user || user.password !== password)
        return socket.emit("sign in fail", "❌ Invalid username or password.");

      socket.emit("sign in success", username);

      const msgs = await Message.find({}).limit(100);
      socket.emit("previous messages", msgs);
    } catch (err) {
      console.error("Sign-in error:", err);
      socket.emit("sign in fail", "❌ Server error during sign-in");
    }
  });

  // 🟨 CHAT MESSAGE (with anti-spam + sanitize)
  socket.on("chat message", async (msg) => {
    const now = Date.now();
    const username = msg.username;

    if (!userData[username]) {
      userData[username] = {
        lastMsgTime: 0,
        lastMsgText: "",
        spamCount: 0,
        mutedUntil: 0
      };
    }

    const user = userData[username];

    // Check mute
    if (now < user.mutedUntil) {
      return socket.emit("spam warning", "🔇 You are muted for spamming. Please wait.");
    }

    // Rate limit (1 msg / 2s)
    if (now - user.lastMsgTime < 2000) {
      user.spamCount++;
      if (user.spamCount >= 3) {
        user.mutedUntil = now + 30000; // 30s mute
        user.spamCount = 0;
        return socket.emit("spam warning", "🚫 You’ve been muted for 30s (spamming too fast).");
      }
      return socket.emit("spam warning", "⛔ Too fast! Wait before sending again.");
    }

    // Length limit
    if (msg.text.length > 300) {
      return socket.emit("spam warning", "📏 Message too long! Max 300 characters.");
    }

    // Duplicate detection
    if (msg.text === user.lastMsgText) {
      return socket.emit("spam warning", "⚠️ Duplicate message blocked.");
    }

    // Passed checks → sanitize + save
    user.lastMsgTime = now;
    user.lastMsgText = msg.text;
    user.spamCount = 0;

    const fullMsg = {
      username,
      text: sanitize(msg.text),
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
    };

    const saved = await Message.create(fullMsg);
    io.emit("chat message", saved);
  });

  // 🗑️ DELETE MESSAGE
  socket.on("delete message", async (id) => {
    await Message.findByIdAndDelete(id);
    io.emit("message deleted", id);
  });

  // ✏️ EDIT MESSAGE (with sanitize)
  socket.on("edit message", async ({ id, newText }) => {
    newText = sanitize(newText);
    const updated = await Message.findByIdAndUpdate(id, { text: newText }, { new: true });
    io.emit("message edited", updated);
  });
});

async function sendPushNotification(userId, payload) {
  if (!userTokens[userId]) {
    console.log(`No tokens registered for user ${userId}`);
    return;
  }
  const tokens = userTokens[userId];
  try {
    const response = await admin.messaging().sendToDevice(tokens, payload);
    console.log(`Sent push notification to user ${userId}`, response);
  } catch (err) {
    console.error('Error sending push notification:', err);
  }
}

const saved = await Message.create(fullMsg);
io.emit("chat message", saved);

// Prepare notification payload
const payload = {
  notification: {
    title: `New message from ${saved.username}`,
    body: saved.text,
    click_action: 'https://chat-app-4x3l.onrender.com/', // update with your frontend URL
    icon: '/icon-192.png'  // make sure this icon exists in frontend folder
  }
};

// Send push notification to all users
sendPushNotificationToAll(payload);

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));
