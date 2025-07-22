const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: String,
  date: String
});

module.exports = mongoose.model("Message", messageSchema);
