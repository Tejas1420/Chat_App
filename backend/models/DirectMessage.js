import mongoose from "mongoose";

const DirectMessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  time: String,
  date: String,
  reactions: { type: Map, of: [String], default: {} },
  seen: { type: [String], default: [] }
});

export default mongoose.model("DirectMessage", directMessageSchema);
