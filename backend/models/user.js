const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  fcmTokens: {
    type: [String],      // Array of strings to store multiple tokens
    default: []
  }
});

module.exports = mongoose.model('User', userSchema);

//made by tejas singh