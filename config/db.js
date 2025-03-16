const mysql = require('mysql2');
require('dotenv').config();

// สร้าง Connection Pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ตรวจสอบการเชื่อมต่อ
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MySQL Connection Error:', err);
        process.exit(1);
    }
    console.log('✅ MySQL Connected Successfully!');
    connection.release();
});

module.exports = pool.promise();
