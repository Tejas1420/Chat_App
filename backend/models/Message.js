const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: String,
  date: String
});

export default mongoose.model("Message", messageSchema);
// made by tejas singh
