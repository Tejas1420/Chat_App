const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const sanitizeHtml = require("sanitize-html");

const User = require("./models/user");

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 📦 MongoDB connect
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

app.use(express.static(path.join(__dirname, "../frontend")));

// 🧾 Message Schema for group
const messageSchema = new mongoose.Schema({
  groupId: String,
  username: String,
  text: String,
  time: String,
  date: String,
});
const Message = mongoose.model("Message", messageSchema);

// 📩 Direct Messages
const dmSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  time: String,
  date: String,
});
const DirectMessage = mongoose.model("DirectMessage", dmSchema);

// 🧠 Auth helper
async function authenticateUser(username, password) {
  const user = await User.findOne({ username });
  if (!user) return false;
  const match = await bcrypt.compare(password, user.password);
  return match ? user : false;
}

// 🛰️ Socket events
io.on("connection", (socket) => {
  console.log("📶 A user connected");

  // Rooms
  socket.on("join group", (groupId) => {
    socket.join(groupId);
    console.log(`👥 Joined group: ${groupId}`);
  });

  socket.on("join dm", ({ user1, user2 }) => {
    const roomName = [user1, user2].sort().join("_");
    socket.join(roomName);
    console.log(`💬 Joined DM room: ${roomName}`);
  });

  // Signup
  socket.on("sign up", async ({ username, password }) => {
    try {
      const exists = await User.findOne({ username });
      if (exists) return socket.emit("sign up fail", "❌ Username already taken");

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({
        username,
        password: hashedPassword,
        friends: [],
        friendRequests: [],
        sentRequests: [],
      });

      await newUser.save();
      socket.emit("sign up success");
    } catch (err) {
      console.error("Signup error:", err);
      socket.emit("sign up fail", "❌ Server error during sign-up");
    }
  });

  // Signin
  socket.on("sign in", async ({ username, password }) => {
    try {
      const user = await authenticateUser(username, password);
      if (!user) return socket.emit("sign in fail", "❌ Invalid username or password");

      socket.emit("sign in success", username);
      const msgs = await Message.find({ groupId: "general" }).limit(100);
      socket.emit("previous messages", msgs);
    } catch (err) {
      console.error("Signin error:", err);
      socket.emit("sign in fail", "❌ Server error during sign-in");
    }
  });

  // Group Chat Message
  socket.on("chat message", async (msg) => {
    try {
      const cleanText = sanitizeHtml(msg.text);
      const fullMsg = {
        groupId: msg.groupId,
        username: msg.username,
        text: cleanText,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
      };

      const saved = await Message.create(fullMsg);
      io.to(msg.groupId).emit("chat message", saved);
    } catch (err) {
      console.error("Chat error:", err);
    }
  });

  // DM
  socket.on("private message", async ({ from, to, text }) => {
    try {
      const cleanText = sanitizeHtml(text);
      const fullMsg = {
        from,
        to,
        text: cleanText,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
      };

      const saved = await DirectMessage.create(fullMsg);
      const room = [from, to].sort().join("_");
      io.to(room).emit("private message", saved);
    } catch (err) {
      console.error("DM error:", err);
    }
  });

  // Delete message (with owner check)
  socket.on("delete message", async ({ id, username }) => {
    try {
      const msg = await Message.findById(id);
      if (!msg || msg.username !== username) return;
      await Message.findByIdAndDelete(id);
      io.emit("message deleted", id);
    } catch (err) {
      console.error("❌ Delete failed:", err);
    }
  });

  // Edit message (with owner check)
  socket.on("edit message", async ({ id, newText, username }) => {
    try {
      const msg = await Message.findById(id);
      if (!msg || msg.username !== username) return;

      const cleanText = sanitizeHtml(newText);
      const updated = await Message.findByIdAndUpdate(id, { text: cleanText }, { new: true });
      io.emit("message edited", updated);
    } catch (err) {
      console.error("Edit error:", err);
    }
  });

  // Friend request system
  socket.on("send friend request", async ({ from, to }) => {
    try {
      const recipient = await User.findOne({ username: to });
      const sender = await User.findOne({ username: from });

      if (!recipient || !sender) return socket.emit("friend request error", "User not found");

      if (recipient.friendRequests.includes(from))
        return socket.emit("friend request error", "Already requested");

      recipient.friendRequests.push(from);
      sender.sentRequests.push(to);

      await recipient.save();
      await sender.save();

      socket.emit("friend request sent");
    } catch (err) {
      console.error("Friend request error:", err);
    }
  });

  socket.on("accept friend request", async ({ from, to }) => {
    try {
      const user = await User.findOne({ username: to });
      const sender = await User.findOne({ username: from });

      if (!user || !sender) return socket.emit("friend accept error", "User not found");

      if (!user.friends.includes(from)) user.friends.push(from);
      if (!sender.friends.includes(to)) sender.friends.push(to);

      user.friendRequests = user.friendRequests.filter((u) => u !== from);
      sender.sentRequests = sender.sentRequests.filter((u) => u !== to);

      await user.save();
      await sender.save();

      socket.emit("friend request accepted");
    } catch (err) {
      console.error("Friend accept error:", err);
    }
  });
});

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));
