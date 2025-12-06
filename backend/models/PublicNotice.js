// backend/models/Notification.js

const mongoose = require('mongoose');

const PublicNoticeSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['announcement', 'system'] // 訊息類型
    },
    targetRole: {
        type: String,
        enum: ['student', 'store', 'all'], // 目標用戶群
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

module.exports = mongoose.model('PublicNotice', PublicNoticeSchema);