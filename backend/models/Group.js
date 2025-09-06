// backend/models/Group.js
import mongoose from "mongoose";

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: String, required: true }, // username
  members: { type: [String], default: [] }, // usernames
  description: { type: String, default: "" },
  avatar: { type: String, default: "" }, // url
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Group", GroupSchema);