// backend/models/DirectMessage.js
import mongoose from "mongoose";

const DirectMessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, default: "" },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "DirectMessage", default: null },
  attachments: [{ url: String, mime: String, name: String }],
  time: String,
  date: String,
  deliveredTo: { type: [String], default: [] },
  seenBy: { type: [String], default: [] },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default mongoose.model("DirectMessage", DirectMessageSchema);