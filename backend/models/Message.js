import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: String,
  date: String,
  reactions: { type: Map, of: [String], default: {} }, // emoji → [usernames]
  seen: { type: [String], default: [] },
  deliveredTo: [String], // usernames who got it
  seenBy: [String],      // usernames who read it
// fields to add: groupId (nullable), replyTo (message id), attachments (array), threadId (for threads)
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null }, // if message is in a thread
  attachments: [{ url: String, mime: String, name: String }],
  // existing: time, date, deliveredTo, seenBy, reactions...
});

export default mongoose.model("Message", MessageSchema);
// made by tejas singh
