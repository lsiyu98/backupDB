// === 連線 MongoDB ===
const mongoose = require('mongoose');
//const connectDB = require('../Nosql/CAMPUS');
connectDB().then(() => console.log("🚀 MongoDB 已連線"));

async function connectDB() {
    try {
        await mongoose.connect('mongodb://localhost:27017/campusfooddb', {
            serverSelectionTimeoutMS: 30000,
            bufferTimeoutMS: 30000
        });
        console.log("🚀 MongoDB 已連線");
    } catch (err) {
        console.error("❌ MongoDB 連線錯誤:", err);
        process.exit(1);
    }
}

connectDB();

//mongoose.connect("mongodb://localhost:27017/campus_chat", {
    //useNewUrlParser: true,
    //useUnifiedTopology: true
//})
//.then(() => console.log("MongoDB 已連線"))
//.catch(err => console.error("MongoDB 連線失敗:", err));

// 載入模型
const Message = require('./models/Message');
const PublicNotice = require('./models/PublicNotice');

mongoose.connection.on("connected", () => {
  console.log("🔥 已連線到資料庫：", mongoose.connection.name);
  console.log("🔥 Mongo 連線位置：", mongoose.connection.host + ":" + mongoose.connection.port);
});

// 導入所需模組
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const cors = require('cors');

// === 統一 CORS 設定（最重要） ===
const corsOptions = {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
};

// === 伺服器設定 ===
const PORT = 3001;

// 建立 Express
const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// 建立 HTTP server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

// === MySQL 連線池 ===
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'yuntechdb',
    database: 'CampusFoodDB',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log("MySQL 連線池建立成功");
} catch (err) {
    console.error("MySQL 連線池建立失敗：", err);
    process.exit(1);
}

// === 線上使用者記錄 ===
const connectedUsers = {};       // userID → socketId
const socketIdToUser = {};       // socketId → { id, role }

// ===============================
// Socket.IO 即時通訊邏輯
// ===============================
io.on("connection", (socket) => {
    console.log("使用者連線:", socket.id);

    // 用戶註冊
    socket.on("register_user", ({ id, role }) => {
        if (!id || !role) {
            socket.emit("auth_error", { message: "ID 或 Role 缺失" });
            return;
        }

        connectedUsers[id] = socket.id;
        socketIdToUser[socket.id] = { id, role };

        socket.join(id);     // 個人房間
        socket.join(role);   // 角色房間（student / store / admin）

        console.log(`註冊成功 → ${id} (${role}) 加入房間: [${id}], [${role}]`);
    });

    // ▼ 點對點聊天
    socket.on("send_chat_message", async (data) => {
    const { senderId, receiverId, message } = data;

    // 🔥 取接收方角色 (targetRole)
    const receiverSocketId = connectedUsers[receiverId];
    const targetRole = socketIdToUser[receiverSocketId]?.role || "student";

    // 🔥 寫入 MongoDB（新 schema）
    try {
        await Message.create({
            senderId,
            type: "text",
            targetRole,
            message
        });
        console.log("💾 聊天訊息已寫入 MongoDB (新 Schema)");
    } catch (err) {
        console.error("❌ 聊天訊息寫入失敗:", err);
    }

    // 🔥 發送訊息給接收者
    io.to(receiverId).emit("receive_chat_message", {
        ...data,
        timestamp: Date.now()
    });
});




    // ▼ 斷線清除
    socket.on("disconnect", () => {
        const userData = socketIdToUser[socket.id];
        if (userData) {
            delete connectedUsers[userData.id];
            delete socketIdToUser[socket.id];
            console.log(`使用者離線：${userData.id}`);
        }
    });
});

// ===============================
// Express API
// ===============================

// ▼ 1. 公告廣播 API
app.post("/api/broadcast", async(req, res) => {
    const { senderId, senderRole, target, message } = req.body;

    if (senderRole !== "store" && senderRole !== "admin") {
        return res.status(403).json({ success: false, message: "只有店家/管理員可以公告" });
    }

    const announcement = {
        sender: `${senderRole} (${senderId})`,
        message,
        timestamp: Date.now()
    };

    // 寫入 MongoDB (公告)
    try {
        await PublicNotice.create({
            senderId,
            receiverId: target,
            senderRole,
            message
        });

        console.log("💾 公告已寫入 MongoDB");
    } catch (err) {
        console.error("❌ 公告寫入失敗:", err);
    }


    console.log("\n=== 公告 API 呼叫成功 ===");
    console.log("來自：", senderId, "角色：", senderRole);
    console.log("目標：", target);
    console.log("內容：", message);

    if (target === "all") {
        io.emit("new_announcement", announcement);
        console.log("✔ 已發送給所有人");
    }
    else if (["student", "store", "admin"].includes(target)) {
        io.to(target).emit("new_announcement", announcement);
        console.log(`✔ 已發送給房間：${target}`);
    }
    else {
        console.log("❌ 無效目標");
        return res.status(400).json({ success: false, message: "無效的廣播目標" });
    }

    return res.json({ success: true, message: "公告已成功發布" });
});

// ▼ 2. 訂單狀態更新 API
app.post("/api/order/status", async (req, res) => {
    const { senderId, senderRole, orderId, newStatus } = req.body;

    if (senderRole !== "store") {
        return res.status(403).json({
            success: false,
            message: "只有店家能更新訂單狀態"
        });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const [rows] = await conn.execute(
            "SELECT UserID, StoreID FROM `Order` WHERE OrderID = ?",
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "訂單不存在" });
        }

        const order = rows[0];
        const targetUserId = `user${order.UserID}`;

        // 更新資料庫
        await conn.execute(
            "UPDATE `Order` SET Status = ? WHERE OrderID = ?",
            [newStatus, orderId]
        );

        const updateData = {
            orderId,
            status: newStatus,
            timestamp: Date.now(),
            updater: senderId
        };

        io.to(targetUserId).emit("order_status_update", updateData);
        io.to("admin").emit("order_status_update", updateData);

        return res.json({ success: true });
    } catch (err) {
        console.error("訂單狀態更新錯誤：", err);
        return res.status(500).json({ success: false, message: "伺服器錯誤" });
    } finally {
        if (conn) conn.release();
    }
});

// 取得公告歷史
app.get("/api/announcements/history", async (req, res) => {
    const history = await PublicNotice.find().sort({ createdAt: 1 });
    res.json(history);
});

// 取得使用者聊天歷史
app.get("/api/messages/history/:userId", async (req, res) => {
    const userId = req.params.userId;

    const history = await Message.find({
        $or: [
            { senderId: userId },
            { receiverId: userId }
        ]
    }).sort({ createdAt: 1 });

    res.json(history);
});


// 啟動伺服器
server.listen(PORT, () => {
    console.log(`\n伺服器已啟動：http://localhost:${PORT}`);
    console.log("CORS 設定：允許所有前端來源 *");
});
