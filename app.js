require('dotenv').config(); 
var createError = require('http-errors'); 
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');

// ใช้ MySQL แทน MongoDB
require('./config/db');

const products = require('./routes/products');
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/usersRoutes');

const app = express();

app.use(cors({
    origin: '*', 
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization'
}));

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
app.use('/api/materials', materialsRoutes);
app.use("/api/tables", tableRoutes(io)); 
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
app.use("/api/orders", orderRoutes(io));
// ทดสอบ API
app.get('/api/test', (req, res) => {
    res.json({ message: "✅ API is working!" });
});

// Catch 404 and Forward to Error Handler
app.use(function(req, res, next) {
  next(createError(404));
});

// Error Handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

// Start Server

// const PORT = process.env.PORT || 3000; // ต้องใช้ process.env.PORT เท่านั้น ห้าม hardcode
// app.set('port', PORT);

// const server = http.createServer(app);

// server.listen(PORT, () => {
//     console.log(`✅ Server running on port ${PORT}`);
// });

module.exports = app;
