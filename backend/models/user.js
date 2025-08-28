import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  fcmTokens: {
    type: [String],      
    default: []
  },
  friends: { type: [String], default: [] },
  friendRequests: { type: [String], default: [] }
});

export default mongoose.model('User', userSchema);

//made by tejas singh