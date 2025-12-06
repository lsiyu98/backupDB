const mongoose = require("mongoose");

const publicNoticeSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
  },
  receiverId: {
    type: String,  // null = broadcast
    default: null,
  },
  senderRole: {
    type: String,
    enum: ["admin", "student", "vendor"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("PublicNotice", publicNoticeSchema);
