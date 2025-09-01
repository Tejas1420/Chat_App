import express from "express";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import Message from "./models/Message.js";
import User from "./models/user.js";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getMessaging } from "firebase-admin/messaging";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import DirectMessage from "./models/DirectMessage.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";


const serviceAccountPath = path.resolve("./serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET 

// ===== 1️⃣ Redirect www → non-www =====
app.use((req, res, next) => {
  if (req.headers.host.startsWith("www.")) {
    const newHost = req.headers.host.slice(4); // remove www.
    return res.redirect(301, `https://${newHost}${req.url}`);
  }
  next();
});

// ===== 2️⃣ CORS =====
app.use(
  cors({
    origin: "https://chat-app-4x3l.onrender.com", // your frontend only
    methods: ["GET", "POST"],
  })
);

// ===== 3️⃣ Helmet security headers =====
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://www.gstatic.com"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: [
          "'self'",
          "https://fcm.googleapis.com",
          "https://firebaseinstallations.googleapis.com",
          "https://fcmregistrations.googleapis.com",
          "https://www.googleapis.com",
          "https://securetoken.googleapis.com"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        mediaSrc: ["'self'"],
        childSrc: ["'self'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        manifestSrc: ["'self'"]
      }
    },
    frameguard: { action: "deny" },
    hsts: {
      maxAge: 31536000,      // 1 year
      includeSubDomains: true,
      preload: true
    }
  })
);

// ===== 4️⃣ Serve static files with CSP =====
app.use(express.static(path.join(__dirname, "../frontend")));

// ===== 5️⃣ Ensure JSON responses also have CSP =====
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://www.gstatic.com; style-src 'self'; img-src 'self' data:;"
  );
  next();
});

// ===== 6️⃣ Example routes =====
app.get("/api/messages", (req, res) => {
  res.json({ messages: [] });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

// ===== 7️⃣ Other security headers =====
app.use(helmet.xssFilter());
app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.referrerPolicy({ policy: "no-referrer" }));

const server = http.createServer(app);
const io = new Server(server);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

app.use(express.static(path.join(__dirname, "../frontend")));

// 🛡️ Sanitize function
function sanitize(input) {
  if (typeof input !== "string") return input;
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const userTokens = {};
const userData = {};
const onlineUsers = new Set(); // ✅ online users

// Rate limiter for /api/register-token
const registerTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});


async function sendPushNotificationToAll(payload) {
  try {
    const users = await User.find({ fcmTokens: { $exists: true, $ne: [] } });
    const tokens = users.flatMap(user => user.fcmTokens);

    if (tokens.length === 0) {
      console.log('No tokens registered to send notifications');
      return;
    }

    const message = {
      tokens,
      notification: {
        title: payload.notification.title,
        body: payload.notification.body,
      },
      webpush: {
        fcmOptions: { link: payload.notification.click_action },
        notification: { icon: payload.notification.icon },
      },
    };

    const response = await getMessaging().sendEachForMulticast(message);
    console.log('Push notification sent:', response);
  } catch (err) {
    console.error('Error sending push notification:', err);
  }
}

app.post('/api/register-token', registerTokenLimiter, async (req, res) => {
  const { username, fcmToken } = req.body;
  if (!username || !fcmToken) {
    return res.status(400).json({ error: 'Missing username or fcmToken' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
      await user.save();
    }

    console.log(`✅ Registered token for ${username}: ${fcmToken}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error registering token:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


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

socket.on("token login", async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;

    const user = await User.findOne({ username });
    if (!user) return socket.emit("sign in error", "❌ Invalid token");

    socket.data.username = username;
    onlineUsers.add(username);
    socket.join(username);

    socket.emit("sign in success", username);
    const msgs = await Message.find({}).limit(100);
    socket.emit("previous messages", msgs);
    io.emit("online users", Array.from(onlineUsers));
  } catch {
    socket.emit("sign in error", "❌ Token expired or invalid");
  }
});
  // 🟩 SIGN UP
  socket.on("sign up", async ({ username, password }) => {
  try {
    const exists = await User.findOne({ username });
    if (exists) return socket.emit("sign up error", "❌ Username already taken");

    const newUser = new User({ username, password });
    await newUser.save();

    // auto-login
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    socket.data.username = username;
    onlineUsers.add(username);
    socket.join(username);

    socket.emit("sign up success", username);
    socket.emit("set-cookie", token);
    io.emit("online users", Array.from(onlineUsers));
  } catch (err) {
    console.error(err);
    socket.emit("sign up error", "❌ Server error during sign-up");
  }
});
  // 🟦 SIGN IN
  socket.on("sign in", async ({ username, password }) => {
  try {
    const user = await User.findOne({ username });
    if (!user || user.password !== password)
      return socket.emit("sign in error", "❌ Invalid username or password.");

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });

    socket.data.username = username;
    onlineUsers.add(username);
    socket.join(username);

    socket.emit("sign in success", username);
    socket.emit("set-cookie", token);

    const msgs = await Message.find({}).limit(100);
    socket.emit("previous messages", msgs);
    io.emit("online users", Array.from(onlineUsers));
  } catch (err) {
    console.error(err);
    socket.emit("sign in error", "❌ Server error during sign-in");
  }
});

  // 📩 Send Friend Request
  socket.on("send friend request", async (toUser) => {
    const fromUser = socket.data.username;
    if (!fromUser || fromUser === toUser) return;

    const target = await User.findOne({ username: toUser });
    if (!target) return socket.emit("error", "User not found");

    if (!target.friendRequests.includes(fromUser) && !target.friends.includes(fromUser)) {
      target.friendRequests.push(fromUser);
      await target.save();
      io.emit("sidebar update", toUser); // tell target user to refresh sidebar
    }
  });

  // ✅ Accept Friend Request
  socket.on("accept friend request", async (fromUser) => {
    const toUser = socket.data.username;
    const me = await User.findOne({ username: toUser });
    const sender = await User.findOne({ username: fromUser });

    if (me && sender && me.friendRequests.includes(fromUser)) {
      me.friendRequests = me.friendRequests.filter(u => u !== fromUser);
      sender.friendRequests = sender.friendRequests.filter(u => u !== toUser);
      me.friends.push(fromUser);
      sender.friends.push(toUser);
      await me.save();
      await sender.save();
      io.emit("sidebar update", toUser);
      io.emit("sidebar update", fromUser);
    }
  });

  // ❌ Decline Friend Request
  socket.on("decline friend request", async (fromUser) => {
    const toUser = socket.data.username;
    const me = await User.findOne({ username: toUser });
    if (me && me.friendRequests.includes(fromUser)) {
      me.friendRequests = me.friendRequests.filter(u => u !== fromUser);
      await me.save();
      io.emit("sidebar update", toUser);
    }
  });

  // 📜 Send sidebar data
  socket.on("get sidebar", async () => {
    const me = await User.findOne({ username: socket.data.username });
    if (me) {
      socket.emit("sidebar data", {
        friends: me.friends,
        friendRequests: me.friendRequests
      });
    }
  });


  // 🟨 CHAT MESSAGE
  socket.on("chat message", async (msg) => {
    const now = Date.now();
    const username = msg.username;

    if (!userData[username]) {
      userData[username] = { lastMsgTime: 0, lastMsgText: "", spamCount: 0, mutedUntil: 0 };
    }

    const user = userData[username];

    if (now < user.mutedUntil) {
      return socket.emit("spam warning", "🔇 You are muted for spamming. Please wait.");
    }

    if (now - user.lastMsgTime < 2000) {
      user.spamCount++;
      if (user.spamCount >= 3) {
        user.mutedUntil = now + 30000;
        user.spamCount = 0;
        return socket.emit("spam warning", "🚫 You’ve been muted for 30s (spamming too fast).");
      }
      return socket.emit("spam warning", "⛔ Too fast! Wait before sending again.");
    }

    if (msg.text.length > 300) {
      return socket.emit("spam warning", "📏 Message too long! Max 300 characters.");
    }

    if (msg.text === user.lastMsgText) {
      return socket.emit("spam warning", "⚠️ Duplicate message blocked.");
    }

    user.lastMsgTime = now;
    user.lastMsgText = msg.text;
    user.spamCount = 0;

    const fullMsg = {
      username,
      text: sanitize(msg.text),
time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
date: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })
    };

    const saved = await Message.create(fullMsg);
    io.emit("chat message", saved);

    const payload = {
      notification: {
        title: `New message from ${saved.username}`,
        body: saved.text,
        click_action: 'https://chat-app-4x3l.onrender.com/',
        icon: '/icon-192.png',
      },
    };

    sendPushNotificationToAll(payload);
  });

  // ✅ Typing indicators
  socket.on("typing", () => {
    if (socket.data.username) {
      socket.broadcast.emit("typing", socket.data.username);
    }
  });

  socket.on("stop typing", () => {
    if (socket.data.username) {
      socket.broadcast.emit("stop typing", socket.data.username);
    }
  });

  // Delete message
  socket.on("delete message", async (id) => {
    try {
      await Message.findByIdAndDelete(id);
      io.emit("message deleted", id);
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  });

  // Edit message
  socket.on("edit message", async ({ id, newText }) => {
    try {
      const sanitizedText = sanitize(newText);
      const updatedMsg = await Message.findByIdAndUpdate(id, { text: sanitizedText }, { new: true });
      if (updatedMsg) {
        io.emit("message edited", updatedMsg);
      }
    } catch (err) {
      console.error("Error editing message:", err);
    }
  });

  // 📩 Send DM
socket.on("direct message", async ({ to, text }) => {
  const from = socket.data.username;
  if (!from || !to || !text.trim()) return;

  const fullMsg = {
    from,
    to,
    text: sanitize(text),
time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
date: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),

  };

  const saved = await DirectMessage.create(fullMsg);

  io.to(from).emit("direct message", saved);
  io.to(to).emit("direct message", saved);
});

// 📜 Load DM history
socket.on("get direct messages", async (friend) => {
  const me = socket.data.username;
  if (!me) return;

  const msgs = await DirectMessage.find({
    $or: [
      { from: me, to: friend },
      { from: friend, to: me }
    ]
  }).sort({ _id: 1 }).limit(100);

  socket.emit("direct messages", { friend, msgs });
});

// 📜 Load group messages
socket.on("get group messages", async () => {
  try {
    const msgs = await Message.find({}).limit(100);
    socket.emit("previous messages", msgs);
  } catch (err) {
    console.error("Error fetching group messages:", err);
  }
});

// ===== DM message delete =====
socket.on("delete dm", async ({ to, id }) => {
  const from = socket.data.username;
  if (!from || !to) return;
  try {
    const deleted = await DirectMessage.findByIdAndDelete(id);
    if (deleted) {
      io.to(from).to(to).emit("message deleted", id);
    }
  } catch (err) {
    console.error("DM delete error:", err);
  }
});

// ===== DM message edit =====
socket.on("edit dm", async ({ to, id, newText }) => {
  const from = socket.data.username;
  if (!from || !to || !newText?.trim()) return;
  try {
    const updated = await DirectMessage.findByIdAndUpdate(
      id,
      { text: sanitize(newText) },
      { new: true }
    );
    if (updated) {
      io.to(from).to(to).emit("message edited", updated);
    }
  } catch (err) {
    console.error("DM edit error:", err);
  }
});
  // Handle disconnect
  socket.on("disconnect", () => {
    if (socket.data.username) {
      onlineUsers.delete(socket.data.username);
      io.emit("online users", Array.from(onlineUsers));
    }
  });
});

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));

// made by tejas singh