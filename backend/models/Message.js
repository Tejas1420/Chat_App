// backend/models/Message.js
import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  username: { type: String, required: true }, // sender
  text: { type: String, default: "" },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  attachments: [{ url: String, mime: String, name: String }],
  time: String,
  date: String,
  deliveredTo: { type: [String], default: [] },
  seenBy: { type: [String], default: [] },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default mongoose.model("Message", MessageSchema);