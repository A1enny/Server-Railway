const express = require("express");
const router = express.Router();
const db = require("../config/db"); // เชื่อม MySQL Database

// 📌 1. ดึงข้อมูลสรุปยอดขาย
router.get("/summary", async (req, res) => {
  try {
    const summaryQuery = `
      SELECT 
  COALESCE(SUM(m.price * oi.quantity), 0) AS total_sales,  -- ยอดขายรวมจาก order_items โดยดึงราคาเมนูจาก menus
  COALESCE(COUNT(DISTINCT o.table_id), 0) AS total_customers,  -- จำนวนลูกค้าจาก orders
  COALESCE(COUNT(o.order_id), 0) AS total_orders,  -- จำนวนคำสั่งซื้อ
  COALESCE(AVG(m.price * oi.quantity), 0) AS average_sales_per_order  -- ยอดขายเฉลี่ยต่อคำสั่งซื้อ
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id  -- เชื่อมตาราง orders กับ order_items
JOIN menus m ON oi.menu_id = m.menu_id  -- เชื่อมตาราง order_items กับ menus เพื่อดึงราคา
LIMIT 0, 1000;

    `;

    const [summary] = await db.query(summaryQuery);
    res.json(summary[0]);
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📌 2. ดึงข้อมูล Line Chart (ยอดขายรายเดือน)
router.get("/line", async (req, res) => {
  try {
    const lineQuery = `
      SELECT 
  DATE_FORMAT(o.order_time, '%Y-%m') AS month, 
  SUM(oi.subtotal) AS total_sales
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.status = 'ชำระเงินแล้ว'
GROUP BY DATE_FORMAT(o.order_time, '%Y-%m')
ORDER BY month ASC;

    `;

    const [lineData] = await db.query(lineQuery);
    res.json(lineData);
  } catch (error) {
    console.error("Error fetching sales line chart data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📌 3. ดึงข้อมูล Pie Chart (สัดส่วนยอดขายของแต่ละหมวดหมู่)
router.get("/pie", async (req, res) => {
  try {
    const pieQuery = `
      SELECT 
  c.category_name AS name, 
  SUM(oi.subtotal) AS value
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
JOIN menus m ON oi.menu_id = m.menu_id
JOIN categories c ON m.menu_category_id = c.category_id
WHERE o.status = 'ชำระเงินแล้ว'
GROUP BY c.category_name;

    `;

    const [pieData] = await db.query(pieQuery);
    res.json(pieData);
  } catch (error) {
    console.error("Error fetching sales pie chart data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📌 5. ดึงข้อมูล Bar Chart (ยอดขายแยกตามช่องทาง)
router.get("/bar", async (req, res) => {
  try {
    const barQuery = `
      SELECT m.menu_id AS channel, SUM(m.price * s.quantity) AS sales
      FROM sales s
      JOIN menus m ON s.menu_id = m.menu_id
      GROUP BY m.menu_id;
    `;

    const [barData] = await db.query(barQuery);
    res.json(barData);
  } catch (error) {
    console.error("Error fetching sales bar chart data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📌 6. ดึงสินค้าขายดี (Top Selling Products)
router.get("/products/top", async (req, res) => {
  try {
    const topProductsQuery = `
      SELECT r.recipe_name AS name, SUM(s.quantity) AS quantity_sold, SUM(m.price * s.quantity) AS total_sales
      FROM sales s
      JOIN menus m ON s.menu_id = m.menu_id
      JOIN recipes r ON m.recipe_id = r.recipe_id
      GROUP BY m.menu_id, r.recipe_name
      ORDER BY total_sales DESC
      LIMIT 5;
    `;

    const [topProducts] = await db.query(topProductsQuery);
    res.json(topProducts);
  } catch (error) {
    console.error("Error fetching top products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
