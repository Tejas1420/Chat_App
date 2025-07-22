const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  groupId: { type: String, required: true }, // 🔥 this makes grouping possible
  username: String,
  text: String,
  time: String,
  date: String
});

module.exports = mongoose.models.Message || mongoose.model("Message", messageSchema);
