const mongoose = require('mongoose');

mongoose.connect("mongodb://localhost:27017/CampusFoodDB")
.then(() => console.log("Mongo 連線成功"))
.catch(err => console.error("Mongo 連線失敗:", err));