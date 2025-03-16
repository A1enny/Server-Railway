const express = require("express");
const router = express.Router();
const db = require("../config/db.js");

module.exports = (io) => {
  // ✅ ดึงออเดอร์ทั้งหมด
  router.get("/", async (req, res) => {
    try {
      const sql = `
        SELECT o.order_id, o.table_id, o.total_price, o.order_time, o.status, t.table_number
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.table_id
        ORDER BY o.order_time DESC`;
      const orders = await db.query(sql);
      res.json({ success: true, results: orders });
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ✅ ดึงออเดอร์ล่าสุด 5 รายการ
  router.get("/recent", async (req, res) => {
    try {
      const query = `
        SELECT o.order_id, o.total_price, o.order_time, t.table_number, oi.quantity, oi.subtotal, r.recipe_name, o.status
        FROM orders o
        JOIN tables t ON o.table_id = t.table_id
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN menus m ON oi.menu_id = m.menu_id
        JOIN recipes r ON m.recipe_id = r.recipe_id 
        ORDER BY o.order_time DESC
        LIMIT 5`;
      const [recentOrders] = await db.query(query);
      res.json(recentOrders);
    } catch (error) {
      console.error("❌ Error fetching recent orders:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ✅ ดึงออเดอร์ของโต๊ะ
  router.get("/:tableId", async (req, res) => {
    const { tableId } = req.params;
    try {
      const query = `
        SELECT oi.order_item_id, o.table_id, oi.quantity, oi.subtotal, m.price, o.order_time, r.recipe_name AS itemName
        FROM order_items oi
        LEFT JOIN orders o ON o.order_id = oi.order_id  
        LEFT JOIN menus m ON oi.menu_id = m.menu_id
        LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
        WHERE o.table_id = ? AND o.status != 'ชำระเงินแล้ว'`;
      const [orders] = await db.query(query, [tableId]);
      if (orders.length === 0) {
        return res.status(404).json({ error: "ไม่มีออเดอร์สำหรับโต๊ะนี้" });
      }
      res.json({ success: true, orders });
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลออร์เดอร์" });
    }
  });

  // ✅ ดึงวัตถุดิบจาก materials
  router.get("/materials", async (req, res) => {
    try {
      const sql = `
        SELECT m.material_id, m.name AS material_name, c.category_name, 
          COALESCE(ib.received_date, m.received_date, 'N/A') AS received_date, 
          COALESCE(ib.expiration_date, DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY), 'N/A') AS expiration_date, 
          u.name AS unit_name,  
          m.stock AS total_quantity
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.category_id
        LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
        LEFT JOIN unit u ON m.unit_id = u.id  -- ✅ ใช้ units แทน unit
        LEFT JOIN shelf_life sl ON m.category_id = sl.category_id
        ORDER BY m.material_id ASC
        LIMIT 10`;
      const [materials] = await db.query(sql);
      res.json({ success: true, results: materials });
    } catch (error) {
      console.error("❌ Error fetching materials:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ✅ ตรวจสอบวัตถุดิบก่อนสั่งอาหาร
  const checkStockAvailability = async (recipe_id, quantity) => {
    const [ingredients] = await db.query(
      `SELECT ri.material_id, ri.amount * ? AS required, mat.stock 
       FROM recipe_ingredients ri
       JOIN materials mat ON ri.material_id = mat.material_id
       WHERE ri.recipe_id = ?`,
      [quantity, recipe_id]
    );
    return !ingredients.some((i) => i.stock < i.required);
  };

  return router;
};
