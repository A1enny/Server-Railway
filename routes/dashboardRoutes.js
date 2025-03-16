const express = require("express");
const router = express.Router();
const db = require("../config/db.js");

// ✅ API: สรุปยอดขาย (Sales Summary)
router.get("/sales/summary", async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT 
        COUNT(DISTINCT o.order_id) AS total_orders, 
        SUM(oi.quantity * oi.subtotal) AS total_sales, 
        COUNT(DISTINCT o.table_id) AS total_customers, 
        IFNULL(AVG(oi.quantity * oi.subtotal), 0) AS average_sales_per_order
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id;
    `);
    res.json(result[0]);
  } catch (error) {
    console.error("❌ Error fetching sales summary:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// ✅ API: ดึงข้อมูลการจองโต๊ะที่กำลังจะมาถึง
router.get("/reservations/upcoming", async (req, res) => {
    try {
      const [result] = await db.query(`
        SELECT customer_name AS customer, num_seats AS seats, reservation_time AS time
        FROM reservations
        WHERE reservation_time >= NOW()
        ORDER BY reservation_time ASC
        LIMIT 5;
      `);
      res.json(result);
    } catch (error) {
      console.error("❌ Error fetching upcoming reservations:", error);
      res.status(500).json({ message: "เกิดข้อผิดพลาด" });
    }
  });

// ✅ API: ยอดขายแยกตามช่องทาง (bar chart)
router.get("/sales/bar", async (req, res) => {
    try {
      const [result] = await db.query(`
        SELECT 
          CASE 
            WHEN o.table_id IS NULL THEN 'Delivery'
            ELSE 'Dine-in'
          END AS channel,
          SUM(o.total_price) AS sales
        FROM orders o
        GROUP BY channel;
      `);
      res.json(result);
    } catch (error) {
      console.error("❌ Error fetching bar chart data:", error);
      res.status(500).json({ message: "เกิดข้อผิดพลาด" });
    }
  });
  

// ✅ API: กราฟวงกลมเมนูขายดี (ใช้ recipe_name)
router.get("/sales/pie", async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT r.recipe_name AS name, SUM(oi.quantity) AS value
      FROM order_items oi
      LEFT JOIN menus m ON oi.menu_id = m.menu_id
      LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
      GROUP BY oi.menu_id
      ORDER BY value DESC;
    `);
    res.json(result);
  } catch (error) {
    console.error("❌ Error fetching pie chart data:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// ✅ API: กราฟเส้นยอดขายรายเดือน
router.get("/sales/line", async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT MONTH(o.order_time) AS month, SUM(oi.quantity * oi.subtotal) AS total_sales
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      GROUP BY MONTH(o.order_time)
      ORDER BY month;
    `);
    res.json(result);
  } catch (error) {
    console.error("❌ Error fetching line chart data:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// ✅ API: ออเดอร์ล่าสุด (แสดง recipe_name แทน menu_name)
router.get("/orders/recent", async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT o.table_id AS table_id, 
             GROUP_CONCAT(r.recipe_name SEPARATOR ', ') AS items, 
             o.total_price AS total,
             o.order_time AS time
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN menus m ON oi.menu_id = m.menu_id
      LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
      GROUP BY o.order_id
      ORDER BY o.order_time DESC
      LIMIT 5;
    `);
    res.json(result);
  } catch (error) {
    console.error("❌ Error fetching recent orders:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// ✅ API: วัตถุดิบใกล้หมด
router.get("/inventory/low-stock", async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT m.name AS material_name, m.stock AS quantity
      FROM materials m
      WHERE m.stock < m.min_stock;
    `);
    res.json(result);
  } catch (error) {
    console.error("❌ Error fetching low stock:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// ✅ API: แจ้งเตือน
router.get("/notifications", async (req, res) => {
  try {
    const [result] = await db.query(`
      SELECT 'ออเดอร์ใหม่' AS type, CONCAT('โต๊ะ ', o.table_id, ' มีออเดอร์ใหม่') AS message
      FROM orders o
      WHERE o.total_price > 0
      UNION ALL
      SELECT 'วัตถุดิบใกล้หมด' AS type, CONCAT(m.name, ' เหลือ ', m.stock, ' หน่วย') AS message
      FROM materials m
      WHERE m.stock < m.min_stock;
    `);
    res.json(result);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

module.exports = router;
