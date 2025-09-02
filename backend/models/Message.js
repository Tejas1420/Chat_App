import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: String,
  date: String,
  reactions: { type: Map, of: [String], default: {} }, // emoji → [usernames]
  seen: { type: [String], default: [] }
});

export default mongoose.model("Message", messageSchema);
// made by tejas singh
