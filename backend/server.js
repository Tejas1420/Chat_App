const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const dotenv = require("dotenv");

const User = require("./models/user");

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

// ✅ Message Schema for Group Chat
const messageSchema = new mongoose.Schema({
  groupId: String, // For global and group chats
  username: String,
  text: String,
  time: String,
  date: String,
});
const Message = mongoose.model("Message", messageSchema);

// ✅ Direct Message Schema
const dmSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  time: String,
  date: String,
});
const DirectMessage = mongoose.model("DirectMessage", dmSchema);

io.on("connection", (socket) => {
  console.log("📶 A user connected");

  // 🟩 JOIN CHAT ROOMS
  socket.on("join group", (groupId) => {
    socket.join(groupId);
    console.log(`👥 Joined group: ${groupId}`);
  });

  socket.on("join dm", ({ user1, user2 }) => {
    const roomName = [user1, user2].sort().join("_");
    socket.join(roomName);
    console.log(`💬 Joined DM room: ${roomName}`);
  });

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

      const msgs = await Message.find({ groupId: "general" }).limit(100);
      socket.emit("previous messages", msgs);
    } catch (err) {
      socket.emit("sign in fail", "❌ Server error during sign-in");
    }
  });

  // 🟨 GROUP MESSAGE
  socket.on("chat message", async (msg) => {
    const fullMsg = {
      groupId: msg.groupId,
      username: msg.username,
      text: msg.text,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
    };

    const saved = await Message.create(fullMsg);
    io.to(msg.groupId).emit("chat message", saved);
  });

  // 🟧 DIRECT MESSAGE
  socket.on("private message", async ({ from, to, text }) => {
    const fullMsg = {
      from,
      to,
      text,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
    };

    const saved = await DirectMessage.create(fullMsg);
    const room = [from, to].sort().join("_");

    io.to(room).emit("private message", saved);
  });

  // ✂️ DELETE MESSAGE
  socket.on("delete message", async (id) => {
    await Message.findByIdAndDelete(id);
    io.emit("message deleted", id);
  });

  // ✏️ EDIT MESSAGE
  socket.on("edit message", async ({ id, newText }) => {
    const updated = await Message.findByIdAndUpdate(id, { text: newText }, { new: true });
    io.emit("message edited", updated);
  });

  // ✅ FRIEND SYSTEM
  socket.on("send friend request", async ({ from, to }) => {
    const recipient = await User.findOne({ username: to });
    if (!recipient) return socket.emit("friend request error", "User not found");

    if (recipient.friendRequests.includes(from))
      return socket.emit("friend request error", "Already requested");

    recipient.friendRequests.push(from);
    await recipient.save();
    socket.emit("friend request sent");
  });

  socket.on("accept friend request", async ({ from, to }) => {
    const user = await User.findOne({ username: to });
    const sender = await User.findOne({ username: from });

    if (!user || !sender) return socket.emit("friend accept error", "User not found");

    user.friends.push(from);
    sender.friends.push(to);

    user.friendRequests = user.friendRequests.filter((u) => u !== from);
    sender.sentRequests = sender.sentRequests.filter((u) => u !== to);

    await user.save();
    await sender.save();

    socket.emit("friend request accepted");
  });
});

server.listen(3000, () => console.log("🌐 Server running on http://localhost:3000"));
