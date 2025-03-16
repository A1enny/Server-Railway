require('dotenv').config(); // โหลดตัวแปร ENV ก่อน
var createError = require('http-errors'); 
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');

const connectDB = require('./config/db'); // ✅ ต้อง import แบบนี้

const products = require('./routes/products');
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/usersRoutes');

const app = express(); // ต้องสร้าง Express ก่อนใช้ `app.use()`

app.use(cors({
    origin: '*', 
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization'
}));

// เชื่อมต่อ MongoDB
connectDB(); // ✅ เรียกใช้งาน

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', indexRouter);
app.use('/api/users', usersRouter);
app.use('/products', products);

// Catch 404 and Forward to Error Handler
app.use(function(req, res, next) {
  next(createError(404));
});

app.get('/api/test', (req, res) => {
  res.json({ message: "✅ API is working!" });
});

// Error Handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

// Start Server (ถ้ายังไม่มีไฟล์ `bin/www`)
const PORT = process.env.PORT || 3000;
console.log(`✅ Using PORT: ${PORT}`);
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
