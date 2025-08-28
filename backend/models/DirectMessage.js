import mongoose from "mongoose";

const directMessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  time: String,
  date: String
});

export default mongoose.model("DirectMessage", directMessageSchema);
