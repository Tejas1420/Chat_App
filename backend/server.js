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

io.on("connection", (socket) => {
  console.log("📶 A user connected");

  // 🌐 Detect client IPs
  const realIP = socket.handshake.headers["cf-connecting-ip"];
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  const address = socket.handshake.address;

  console.log("🔍 Connection details:");
  console.log("cf-connecting-ip:", realIP || "None");
  console.log("x-forwarded-for:", forwarded || "None");
  console.log("handshake.address:", address || "None");

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

  // 🟨 MESSAGES
  socket.on("chat message", async (msg) => {
    const fullMsg = {
      username: msg.username,
      text: msg.text,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
    };
    const saved = await Message.create(fullMsg);
    io.emit("chat message", saved);
  });

  socket.on("delete message", async (id) => {
    await Message.findByIdAndDelete(id);
    io.emit("message deleted", id);
  });

  socket.on("edit message", async ({ id, newText }) => {
    const updated = await Message.findByIdAndUpdate(id, { text: newText }, { new: true });
    io.emit("message edited", updated);
  });
});

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));
