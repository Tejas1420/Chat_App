import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

dotenv.config();

const app = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "secret";

if (!process.env.MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error("❌ Missing JWT_SECRET in .env");
  process.exit(1);
}

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://chat-app-4x3l.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.json());
app.use(cookieParser());

// Security headers
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.gstatic.com"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://fcm.googleapis.com", "https://www.googleapis.com", "https://securetoken.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  })
);

// Rate limiter for sensitive routes
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use("/api/", limiter);

// Serve frontend
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../frontend")));

// ====== MongoDB Setup ======
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  });

// ====== Schemas ======
const messageSchema = new mongoose.Schema({
  text: String,
  username: String,
  groupId: { type: String, default: "global" },
  timestamp: { type: Date, default: Date.now },
  edited: { type: Boolean, default: false },
  deliveredTo: [String],
  seenBy: [String],
  reactions: { type: Map, of: [String], default: {} }
});
const Message = mongoose.model("Message", messageSchema);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  fcmToken: String,
  friends: [String],
  friendRequests: [String]
});
const User = mongoose.model("User", userSchema);

const dmSchema = new mongoose.Schema({
  text: String,
  sender: String,
  recipient: String,
  timestamp: { type: Date, default: Date.now },
  edited: { type: Boolean, default: false },
  deliveredTo: [String],
  seenBy: [String],
  reactions: { type: Map, of: [String], default: {} }
});
const DirectMessage = mongoose.model("DirectMessage", dmSchema);

// ====== Firebase Admin ======
if (fs.existsSync("./serviceAccountKey.json")) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf-8"))
    )
  });
  console.log("✅ Firebase initialized");
} else {
  console.warn("⚠️ Firebase disabled (serviceAccountKey.json missing)");
}

// ====== Auth Routes (secure cookies) ======
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (await User.findOne({ username }))
      return res.status(400).json({ error: "Username taken" });

    const hashed = await bcrypt.hash(password, 12);
    const user = new User({ username, password: hashed });
    await user.save();

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 3600 * 1000
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 3600 * 1000
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ====== Socket.IO ======
const onlineUsers = new Set();
const spamGuard = new Map();

io.on("connection", socket => {
  const username = socket.handshake.query.username;
  if (username) {
    socket.data.username = username;
    onlineUsers.add(username);
    socket.join(username);
    io.emit("online users", Array.from(onlineUsers));
  }

  socket.on("chat message", async ({ text, groupId }) => {
    const u = socket.data.username;
    if (!u) return;
    if (!spamGuard.has(u)) spamGuard.set(u, []);
    const now = Date.now();
    const times = spamGuard.get(u).filter(t => now - t < 5000);
    times.push(now);
    spamGuard.set(u, times);
    if (times.length > 5) return socket.emit("error", "Slow down!");

    const msg = new Message({ text, username: u, groupId, deliveredTo: [u] });
    const saved = await msg.save();
    io.emit("chat message", saved);

    await Message.updateOne(
      { _id: saved._id },
      { $addToSet: { deliveredTo: u } }
    );
    io.emit("delivered update", { msgId: saved._id, username: u, type: "group" });
  });

  socket.on("seen", async ({ msgId, type }) => {
    const u = socket.data.username;
    if (!u) return;
    const Model = type === "dm" ? DirectMessage : Message;
    await Model.findByIdAndUpdate(msgId, { $addToSet: { seenBy: u } });
    io.emit("seen update", { msgId, username: u, type });
  });

  socket.on("reaction", async ({ msgId, emoji, type }) => {
    const u = socket.data.username;
    if (!u) return;
    const Model = type === "dm" ? DirectMessage : Message;
    const msg = await Model.findById(msgId);
    if (!msg) return;
    if (!msg.reactions.has(emoji)) msg.reactions.set(emoji, []);
    const arr = msg.reactions.get(emoji);
    if (!arr.includes(u)) arr.push(u);
    msg.reactions.set(emoji, arr);
    await msg.save();
    io.emit("reaction update", { msgId, reactions: msg.reactions, type });
  });

  socket.on("disconnect", () => {
    const u = socket.data.username;
    if (u) {
      onlineUsers.delete(u);
      io.emit("online users", Array.from(onlineUsers));
    }
  });
});

// ====== Start ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));