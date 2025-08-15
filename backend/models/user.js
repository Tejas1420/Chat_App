import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  fcmTokens: {
    type: [String],      // Array of strings to store multiple tokens
    default: []
  },
  friends: { type: [String], default: [] },
  friendRequests: { type: [String], default: [] }
});

export default mongoose.model('User', userSchema);

//made by tejas singh