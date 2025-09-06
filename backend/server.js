// backend/server.js
import express from "express";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import Message from "./models/Message.js";
import User from "./models/user.js";
import DirectMessage from "./models/DirectMessage.js";
import Group from "./models/Group.js";
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getMessaging } from "firebase-admin/messaging";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";

dotenv.config();

const serviceAccountPath = path.resolve("./serviceAccountKey.json");
let serviceAccount = null;
try {
  if (existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
  } else {
    console.warn("⚠️ serviceAccountKey.json not found — Firebase will be disabled until file is added.");
  }
} catch (e) {
  console.warn("⚠️ Could not read serviceAccountKey.json:", e.message);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is not set in environment. Exiting.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.headers.host && req.headers.host.startsWith("www.")) {
    const newHost = req.headers.host.slice(4);
    return res.redirect(301, `https://${newHost}${req.url}`);
  }
  next();
});

app.use(
  cors({
    origin: ["https://chat-app-4x3l.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.gstatic.com"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://fcm.googleapis.com", "https://www.googleapis.com", "https://securetoken.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  })
);

const registerTokenLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60*1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' https://www.gstatic.com; style-src 'self'; img-src 'self' data:;");
  next();
});

// Initialize server + socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ["https://chat-app-4x3l.onrender.com", "http://localhost:3000"], methods: ["GET", "POST"], credentials: true }
});

try {
  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase admin initialized");
  }
} catch (e) {
  console.error("⚠️ Firebase init failed:", e.message);
}

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.connection.on("error", (err) => console.error("MongoDB connection error:", err));

function sanitize(input) {
  if (typeof input !== "string") return input;
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const userData = {};
const onlineUsers = new Set();

// multer for uploads (dev: store on disk)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads/")),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.random().toString(36).slice(2,8);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

// register token
app.post('/api/register-token', registerTokenLimiter, async (req, res) => {
  const { username, fcmToken } = req.body;
  if (!username || !fcmToken) return res.status(400).json({ error: 'Missing username or fcmToken' });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.fcmTokens = user.fcmTokens || [];
    if (!user.fcmTokens.includes(fcmToken)) { user.fcmTokens.push(fcmToken); await user.save(); }
    res.json({ success: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// file upload route
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, name: req.file.originalname, mime: req.file.mimetype });
});

// group create / list
app.post("/api/groups", authLimiter, async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Login required" });
    const { username } = jwt.verify(token, JWT_SECRET);
    const { name, description, members } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const g = await Group.create({ name, description: description || "", owner: username, members: Array.from(new Set([username, ...(members||[])])) });
    res.json(g);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/groups", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Login required" });
    const { username } = jwt.verify(token, JWT_SECRET);
    const groups = await Group.find({ members: username });
    res.json(groups);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// message pagination for groups
app.get("/api/groups/:groupId/messages", async (req, res) => {
  try {
    const { groupId } = req.params;
    const before = req.query.before;
    const limit = Math.min(parseInt(req.query.limit || "50"), 100);
    const query = { groupId };
    if (before) query._id = { $lt: before };
    const msgs = await Message.find(query).sort({ _id: -1 }).limit(limit).lean();
    res.json(msgs.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// optional: get DM history (paged)
app.get("/api/dm/:user", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Login required" });
    const { username } = jwt.verify(token, JWT_SECRET);
    const other = req.params.user;
    const before = req.query.before;
    const limit = Math.min(parseInt(req.query.limit || "50"), 100);
    const q = {
      $or: [{ from: username, to: other }, { from: other, to: username }]
    };
    if (before) q._id = { $lt: before };
    const msgs = await DirectMessage.find(q).sort({ _id: -1 }).limit(limit).lean();
    res.json(msgs.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// ---- auth HTTP endpoints (keep yours)
app.post("/api/signup", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing" });
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: 'Username already taken' });
    const hashed = await bcrypt.hash(password, 12);
    const newUser = new User({ username, password: hashed });
    await newUser.save();
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7*24*60*60*1000 });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});
app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing" });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid username or password." });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid username or password." });
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7*24*60*60*1000 });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// ---------- SOCKET.IO ----------
io.on("connection", (socket) => {
  console.log("📶 A user connected");
  const ua = socket.handshake.headers["user-agent"] || "Unknown";

  // token login
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

  socket.on("sign up", async ({ username, password }) => {
    try {
      const exists = await User.findOne({ username });
      if (exists) return socket.emit("sign up error", "❌ Username already taken");
      const hashed = await bcrypt.hash(password, 12);
      const newUser = new User({ username, password: hashed });
      await newUser.save();
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
      socket.data.username = username;
      onlineUsers.add(username);
      socket.join(username);
      socket.emit("sign up success", username);
      socket.emit("set-cookie", token);
      io.emit("online users", Array.from(onlineUsers));
    } catch (err) { console.error(err); socket.emit("sign up error", "❌ Server error during sign-up"); }
  });

  socket.on("sign in", async ({ username, password }) => {
    try {
      const user = await User.findOne({ username });
      if (!user) return socket.emit("sign in error", "❌ Invalid username or password.");
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return socket.emit("sign in error", "❌ Invalid username or password.");
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
      socket.data.username = username;
      onlineUsers.add(username);
      socket.join(username);
      socket.emit("sign in success", username);
      socket.emit("set-cookie", token);
      const msgs = await Message.find({}).limit(100);
      socket.emit("previous messages", msgs);
      io.emit("online users", Array.from(onlineUsers));
    } catch (err) { console.error(err); socket.emit("sign in error", "❌ Server error during sign-in"); }
  });

  // friend requests (kept)
  socket.on("send friend request", async (toUser) => {
    const fromUser = socket.data.username;
    if (!fromUser || fromUser === toUser) return;
    const target = await User.findOne({ username: toUser });
    if (!target) return socket.emit("error", "User not found");
    if (!target.friendRequests.includes(fromUser) && !target.friends.includes(fromUser)) {
      target.friendRequests.push(fromUser); await target.save();
      io.to(toUser).emit("sidebar update"); // inform specific user
    }
  });

  socket.on("accept friend request", async (fromUser) => {
    const toUser = socket.data.username;
    const me = await User.findOne({ username: toUser });
    const sender = await User.findOne({ username: fromUser });
    if (me && sender && me.friendRequests.includes(fromUser)) {
      me.friendRequests = me.friendRequests.filter(u => u !== fromUser);
      me.friends.push(fromUser);
      sender.friends.push(toUser);
      await me.save(); await sender.save();
      io.to(toUser).emit("sidebar update"); io.to(fromUser).emit("sidebar update");
    }
  });

  socket.on("decline friend request", async (fromUser) => {
    const toUser = socket.data.username;
    const me = await User.findOne({ username: toUser });
    if (me && me.friendRequests.includes(fromUser)) {
      me.friendRequests = me.friendRequests.filter(u => u !== fromUser);
      await me.save();
      io.to(toUser).emit("sidebar update");
    }
  });

  socket.on("get sidebar", async () => {
    const me = await User.findOne({ username: socket.data.username });
    if (me) {
      socket.emit("sidebar data", { friends: me.friends, friendRequests: me.friendRequests });
    }
  });

  // group listing
  socket.on("get groups", async () => {
    if (!socket.data.username) return;
    const groups = await Group.find({ members: socket.data.username });
    socket.emit("groups list", groups);
  });

  // join/leave group room
  socket.on("join group", async (groupId) => {
    if (!socket.data.username) return;
    socket.join(`group:${groupId}`);
    // optional: notify group members that this user joined
  });

  socket.on("leave group", (groupId) => {
    if (!socket.data.username) return;
    socket.leave(`group:${groupId}`);
  });

  // message seen unified
  socket.on("message seen", async (msgId) => {
    const username = socket.data.username; if (!username) return;
    let msg = await Message.findById(msgId) || await DirectMessage.findById(msgId);
    if (!msg) return;
    msg.seenBy = msg.seenBy || [];
    if (!msg.seenBy.includes(username)) { msg.seenBy.push(username); await msg.save(); io.to(username).emit("seen update", { msgId, username }); io.emit("seen update", { msgId, username }); }
  });

  // helper dm room name
  const dmRoom = (a, b) => `dm:${[a,b].sort().join(":")}`;

  // chat message (group)
  socket.on("chat message", async (msg) => {
    try {
      const now = Date.now();
      const username = msg.username;
      if (!username) return;
      if (!userData[username]) userData[username] = { lastMsgTime: 0, lastMsgText: "", spamCount: 0, mutedUntil: 0 };
      const user = userData[username];
      if (now < user.mutedUntil) return socket.emit("spam warning", "🔇 You are muted for spamming.");
      if (now - user.lastMsgTime < 2000) { user.spamCount++; if (user.spamCount >= 3) { user.mutedUntil = now + 30000; user.spamCount = 0; return socket.emit("spam warning", "🚫 You’ve been muted for 30s (spamming too fast)."); } return socket.emit("spam warning", "⛔ Too fast!"); }
      if (msg.text.length > 2000) return socket.emit("spam warning", "📏 Message too long! Max 2000 characters.");
      if (msg.text === user.lastMsgText) return socket.emit("spam warning", "⚠️ Duplicate message blocked.");
      user.lastMsgTime = now; user.lastMsgText = msg.text; user.spamCount = 0;

      const fullMsg = {
        username,
        text: sanitize(msg.text),
        groupId: msg.groupId || null,
        replyTo: msg.replyTo || null,
        attachments: msg.attachments || [],
        time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
        date: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
        deliveredTo: [username],
        seenBy: []
      };

      const saved = await Message.create(fullMsg);

      const room = fullMsg.groupId ? `group:${fullMsg.groupId}` : "global";
      io.to(room).emit("chat message", saved);

      await Message.findByIdAndUpdate(saved._id, { $addToSet: { deliveredTo: username } });
      io.to(room).emit("delivered update", { msgId: saved._id, username, type: fullMsg.groupId ? "group" : "group" });

      // push: send only to group members' tokens
      if (fullMsg.groupId && admin && admin.messaging) {
        const group = await Group.findById(fullMsg.groupId);
        if (group) {
          const memberUsers = await User.find({ username: { $in: group.members } });
          const tokens = memberUsers.flatMap(u => u.fcmTokens || []).filter(Boolean);
          if (tokens.length > 0) {
            const payload = { notification: { title: `New message in ${group.name}`, body: saved.text, click_action: 'https://chat-app-4x3l.onrender.com', icon: '/icon-192.png' } };
            try { await getMessaging().sendEachForMulticast({ tokens, ...payload }); } catch (e) { console.warn("Push send failed", e.message); }
          }
        }
      }
    } catch (err) { console.error("chat message error", err); }
  });

  // direct message
  socket.on("direct message", async ({ to, text, attachments, replyTo }) => {
    try {
      const from = socket.data.username; if (!from || !to || !text?.trim()) return;
      const fullMsg = {
        from, to, text: sanitize(text), attachments: attachments || [],
        replyTo: replyTo || null,
        time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
        date: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
        deliveredTo: [from], seenBy: []
      };
      const saved = await DirectMessage.create(fullMsg);

      // send to both participants via DM room
      const room = dmRoom(from, to);
      io.to(room).emit("direct message", saved);

      // ensure both users are in the DM room (server-side join optional)
      io.to(from).emit("delivered update", { msgId: saved._id, username: from, type: "dm" });
    } catch (err) { console.error("direct message error", err); }
  });

  // get direct messages (history)
  socket.on("get direct messages", async (friend) => {
    try {
      const me = socket.data.username; if (!me) return;
      const msgs = await DirectMessage.find({ $or: [{ from: me, to: friend }, { from: friend, to: me }] }).sort({ _id: 1 }).limit(100);
      socket.emit("direct messages", { friend, msgs });
      // join the server-side socket room for optimized delivery
      socket.join(dmRoom(me, friend));
    } catch (err) { console.error(err); }
  });

  // reactions
  socket.on("add reaction", async ({ msgId, emoji }) => {
    const username = socket.data.username; if (!username) return;
    let msg = await Message.findById(msgId) || await DirectMessage.findById(msgId);
    if (!msg) return;
    const current = msg.reactions || {};
    const arr = current[emoji] || [];
    if (!arr.includes(username)) arr.push(username);
    current[emoji] = arr;
    msg.reactions = current;
    await msg.save();
    io.emit("reaction updated", { msgId, reactions: msg.reactions });
  });

  socket.on("remove reaction", async ({ msgId, emoji }) => {
    const username = socket.data.username; if (!username) return;
    let msg = await Message.findById(msgId) || await DirectMessage.findById(msgId);
    if (!msg) return;
    const current = msg.reactions || {};
    current[emoji] = (current[emoji] || []).filter(u => u !== username);
    if (current[emoji].length === 0) delete current[emoji];
    msg.reactions = current;
    await msg.save();
    io.emit("reaction updated", { msgId, reactions: msg.reactions });
  });

  // edit / delete
  socket.on("edit message", async ({ id, newText }) => {
    try { const sanitizedText = sanitize(newText); const updated = await Message.findByIdAndUpdate(id, { text: sanitizedText }, { new: true }); if (updated) io.emit("message edited", updated); } catch (err) { console.error(err); }
  });
  socket.on("delete message", async (id) => { try { await Message.findByIdAndDelete(id); io.emit("message deleted", id); } catch (err) { console.error(err); } });

  socket.on("edit dm", async ({ to, id, newText }) => { try { const updated = await DirectMessage.findByIdAndUpdate(id, { text: sanitize(newText) }, { new: true }); if (updated) io.to(dmRoom(socket.data.username, to)).emit("message edited", updated); } catch (err) { console.error(err); } });
  socket.on("delete dm", async ({ to, id }) => { try { const deleted = await DirectMessage.findByIdAndDelete(id); if (deleted) io.to(dmRoom(socket.data.username, to)).emit("message deleted", id); } catch (err) { console.error(err); } });

  // delivered (client confirms)
  socket.on("delivered", async ({ msgId, username, type }) => {
    try {
      const Model = type === "dm" ? DirectMessage : Message;
      await Model.findByIdAndUpdate(msgId, { $addToSet: { deliveredTo: username } });
      io.emit("delivered update", { msgId, username, type });
    } catch (err) { console.error(err); }
  });

  socket.on("seen", async ({ msgId, username, type }) => {
    try {
      const Model = type === "dm" ? DirectMessage : Message;
      await Model.findByIdAndUpdate(msgId, { $addToSet: { seenBy: username } });
      io.emit("seen update", { msgId, username, type });
    } catch (err) { console.error(err); }
  });

  // typing indicators
  socket.on("typing", () => { if (socket.data.username) socket.broadcast.emit("typing", socket.data.username); });
  socket.on("stop typing", () => { if (socket.data.username) socket.broadcast.emit("stop typing", socket.data.username); });

  socket.on("disconnect", () => {
    if (socket.data.username) {
      onlineUsers.delete(socket.data.username);
      io.emit("online users", Array.from(onlineUsers));
    }
  });
});

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));