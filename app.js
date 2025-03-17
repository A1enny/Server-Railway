require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');
const http = require('http'); // ใช้ HTTP Server
const socketIo = require('socket.io'); // ใช้ Socket.io

// 📌 ใช้ MySQL แทน MongoDB
require('./config/db');

const app = express();
const server = http.createServer(app); // สร้าง HTTP Server
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
});

// 📌 ตรวจสอบว่า Routes รองรับ io หรือไม่
const orderRoutes = require("./routes/orderRoutes")(io);
const tableRoutes = require("./routes/tableRoutes")(io);
const materialsRoutes = require("./routes/ingredientRoutes"); // ❌ เอา io ออกถ้าไม่รองรับ
const menuRoutes = require("./routes/menuRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const saleRoutes = require("./routes/saleRoutes");
const recipeRoutes = require("./routes/recipeRoutes");
const reportRoutes = require("./routes/reportRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes")(io); // ✅ ให้แน่ใจว่า inventoryRoutes รองรับ io
const unitRoutes = require("./routes/unitRoutes");
const shelfLifeRoutes = require("./routes/shelfLifeRoutes");
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/usersRoutes');

app.use(cors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization'
}));

// ✅ ถ้าใช้ API เท่านั้น สามารถลบ View Engine ได้
// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'jade'); ❌ เปลี่ยนเป็น JSON API

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Routes
app.use('/', indexRouter);
app.use('/api/users', usersRouter);
app.use("/api/materials", materialsRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/shelf_life", shelfLifeRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/orders", orderRoutes);

// ✅ ทดสอบ API
app.get('/api/test', (req, res) => {
    res.json({ message: "✅ API is working!" });
});

// ✅ Catch 404 and Forward to Error Handler
app.use((req, res, next) => {
    next(createError(404));
});

// ✅ Error Handler (แสดง Error เป็น JSON แทน Jade)
app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
        error: err.message || "❌ Internal Server Error",
        status: err.status || 500
    });
});

// 📌 แก้ไขการ Export ให้รองรับ `bin/www`
module.exports = { app, server, io };
