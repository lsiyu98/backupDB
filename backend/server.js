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
    socket.on("send_chat_message", (data) => {
        const { senderId, receiverId } = data;
        io.to(receiverId).emit("receive_chat_message", data);
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
app.post("/api/broadcast", (req, res) => {
    const { senderId, senderRole, target, message } = req.body;

    if (senderRole !== "store" && senderRole !== "admin") {
        return res.status(403).json({ success: false, message: "只有店家/管理員可以公告" });
    }

    const announcement = {
        sender: `${senderRole} (${senderId})`,
        message,
        timestamp: Date.now()
    };

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

// 啟動伺服器
server.listen(PORT, () => {
    console.log(`\n伺服器已啟動：http://localhost:${PORT}`);
    console.log("CORS 設定：允許所有前端來源 *");
});
