const express = require("express");
const router = express.Router();
const db = require("../config/db.js");

module.exports = (io) => {
  router.get("/", async (req, res) => {
    try {
      const sql = `
        SELECT
          o.order_id,
          o.table_id,
          o.total_price,
          o.order_time,  -- ✅ ใช้ order_time แทน created_at
          o.status,
          t.table_number
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.table_id
        ORDER BY o.order_time DESC
      `;

      const orders = await db.query(sql);
      res.json({ success: true, results: orders });
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get("/recent", async (req, res) => {
    try {
      const query = `
      SELECT 
        o.order_id, 
        o.total_price, 
        o.order_time, 
        t.table_number, 
        oi.quantity, 
        oi.subtotal, 
        r.recipe_name, 
        o.status
      FROM orders o
      JOIN tables t ON o.table_id = t.table_id
      JOIN order_items oi ON o.order_id = oi.order_id
      JOIN menus m ON oi.menu_id = m.menu_id
      JOIN recipes r ON m.recipe_id = r.recipe_id 
      ORDER BY o.order_time DESC
      LIMIT 5;
      `;

      const [recentOrders] = await db.query(query);
      res.json(recentOrders);
    } catch (error) {
      console.error("❌ Error fetching recent orders:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get("/:tableId", async (req, res) => {
    const { tableId } = req.params;
    const { guest } = req.query;

    try {
      const query = `
      SELECT 
        oi.order_item_id,
        o.table_id, 
        oi.quantity,  
        oi.subtotal,
        m.price, 
        o.order_time,  -- ✅ ใช้ order_time แทน created_at
        r.recipe_name AS itemName
      FROM order_items oi
      LEFT JOIN orders o ON o.order_id = oi.order_id  
      LEFT JOIN menus m ON oi.menu_id = m.menu_id
      LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
      WHERE o.table_id = ? AND o.status != 'ชำระเงินแล้ว'
    `;

      const [orders] = await db.query(query, [tableId]);

      if (orders.length === 0) {
        return res.status(404).json({ error: "ไม่มีออร์เดอร์สำหรับโต๊ะนี้" });
      }

      res.json({ success: true, orders, isGuest: guest === "true" });
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลออร์เดอร์" });
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

  // ✅ แก้ไข unit เป็น units
  router.get("/materials", async (req, res) => {
    try {
      const sql = `
      SELECT 
        m.material_id, 
        m.name AS material_name, 
        c.category_name, 
        COALESCE(ib.received_date, m.received_date, 'N/A') AS received_date, 
        COALESCE(
          ib.expiration_date, 
          DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY), 
          'N/A'
        ) AS expiration_date, 
        u.name AS unit_name,  -- ✅ ใช้ units.name แทน unit.unit_name
        m.stock AS total_quantity
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.category_id
      LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
      LEFT JOIN units u ON m.unit_id = u.id  -- ✅ แก้จาก unit เป็น units
      LEFT JOIN shelf_life sl ON m.category_id = sl.category_id
      ORDER BY m.material_id ASC
      LIMIT 10;
      `;

      const [materials] = await db.query(sql);
      res.json({ success: true, results: materials });
    } catch (error) {
      console.error("❌ Error fetching materials:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ✅ ฟังก์ชันตัดสต็อก
  const reduceStockFIFO = async (recipe_id, quantity) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [ingredients] = await connection.query(
        `SELECT ri.material_id, ri.amount * ? AS required 
         FROM recipe_ingredients ri
         WHERE ri.recipe_id = ?`,
        [quantity, recipe_id]
      );

      for (const ingredient of ingredients) {
        const { material_id, required } = ingredient;
        let remaining = required;

        while (remaining > 0) {
          const [batch] = await connection.query(
            `SELECT batch_id, quantity - used_quantity AS available 
             FROM inventory_batches 
             WHERE material_id = ? AND status = 'available' 
             ORDER BY received_date ASC, batch_id ASC 
             LIMIT 1 LOCK IN SHARE MODE`,
            [material_id]
          );

          if (!batch.length) {
            throw new Error(`❌ สต็อกหมดสำหรับวัตถุดิบ ${material_id}`);
          }

          const { batch_id, available } = batch[0];
          const used = Math.min(remaining, available);
          remaining -= used;

          await connection.query(
            `UPDATE inventory_batches 
             SET used_quantity = used_quantity + ?, 
                 status = CASE WHEN (quantity - used_quantity - ?) <= 0 THEN 'depleted' ELSE 'available' END
             WHERE batch_id = ?`,
            [used, used, batch_id]
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("❌ Error reducing stock:", error);
      throw error;
    } finally {
      connection.release();
    }
  };

  return router;
};
