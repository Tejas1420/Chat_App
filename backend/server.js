const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const dotenv = require("dotenv");
const Message = require("./models/Message");
const User = require("./models/user"); // Make sure filename matches exactly

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));
