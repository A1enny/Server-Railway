const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ✅ รายงานยอดขายประจำวัน
router.get("/sales/daily", async (req, res) => {
  const { startDate, endDate } = req.query;

  // ถ้าไม่มีวันที่เริ่มต้นและสิ้นสุด จะใช้วันที่ปัจจุบันเป็นค่าดีฟอลต์
  const queryStartDate = startDate || '2022-01-01'; // สามารถปรับให้เป็นวันที่เหมาะสม
  const queryEndDate = endDate || new Date().toISOString().split('T')[0]; // วันที่ปัจจุบัน

  try {
    const [rows] = await db.query(`
      SELECT DATE(o.order_time) AS date, SUM(oi.subtotal) AS total_sales
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      WHERE DATE(o.order_time) BETWEEN ? AND ?
      GROUP BY DATE(o.order_time)
      ORDER BY DATE(o.order_time) DESC
    `, [queryStartDate, queryEndDate]);

    res.json(rows);
  } catch (error) {
    console.error("❌ Error fetching daily sales:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล", details: error.message });
  }
});

// ✅ รายงานยอดขายแยกตามเมนู
router.get("/sales/by-menu", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.recipe_name AS menu_name, 
             SUM(oi.quantity) AS total_orders, 
             SUM(oi.subtotal) AS total_sales
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.menu_id
      JOIN recipes r ON m.recipe_id = r.recipe_id
      GROUP BY r.recipe_id
      ORDER BY total_sales DESC;
    `);

    res.json(rows);
  } catch (error) {
    console.error("❌ Error fetching sales by menu:", error);
    res.status(500).json({
      error: "เกิดข้อผิดพลาดในการดึงข้อมูล",
      details: error.message,
    });
  }
});

module.exports = router;
