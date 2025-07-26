const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  friends: [String],
  friendRequests: [String],
  sentRequests: [String],
});

module.exports = mongoose.model("User", userSchema);
//made by tejas singh