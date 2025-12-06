// CAMPUS.js (位於 Nosql 資料夾內)

const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://localhost:27017/CampusFoodDB'; 

module.exports = function connectDB() {
    return mongoose.connect(MONGODB_URI, {
        // 🚨 關鍵修正：延長伺服器選擇超時時間到 30 秒
        serverSelectionTimeoutMS: 30000, 
        // 🚨 關鍵修正：延長 Mongoose 緩衝超時時間到 30 秒 (解決寫入操作超時)
        bufferTimeoutMS: 30000,
    }) 
    .catch(err => {
        console.error('❌ MongoDB 連線錯誤:', err);
        throw err; 
    });
};