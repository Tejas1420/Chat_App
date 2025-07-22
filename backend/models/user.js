const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  friends: [{ type: String }],          // ✅ Friends list
  friendRequests: [{ type: String }],   // ✅ Incoming requests
  sentRequests: [{ type: String }]      // ✅ Outgoing requests
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
// made by tejas singh
