const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
  },
  type: {
    type: String,   // ex: "text", "system", "notice"
    required: true,
  },
  targetRole: {
    type: String,   // ex: "student", "vendor", "admin", "all"
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

module.exports = mongoose.model("Message", messageSchema);
