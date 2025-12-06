// backend/models/ChatMessage.js

const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    senderId: {
        type: String,
        required: true
    },
    receiverId: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        // 🚨 關鍵修正：確保包含所有三個角色
        enum: ['student', 'store', 'admin'], 
        required: true
    },
    message: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
   
    // 確保只使用 createdAt 欄位
    timestamps: { createdAt: 'createdAt', updatedAt: false }
});

module.exports = mongoose.model('Message', MessageSchema);