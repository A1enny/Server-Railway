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
          o.order_time,
          o.status,
          t.table_number
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.table_id
        ORDER BY o.order_time DESC
      `;

      const orders = await db.query(sql); // ใช้ db.query เพื่อรันคำสั่ง SQL
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
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get("/:tableId", async (req, res) => {
    const { tableId } = req.params;
    const { guest } = req.query;

    try {
      // ดึงออร์เดอร์ที่ยังไม่ชำระเงิน พร้อม subtotal และ price
      const query = `
      SELECT 
        oi.order_item_id,
        o.table_id, 
        oi.quantity,  
        oi.subtotal,
        m.price, 
        o.order_time,
        r.recipe_name AS itemName
      FROM order_items oi
      LEFT JOIN orders o ON o.order_id = oi.order_id  
      LEFT JOIN menus m ON oi.menu_id = m.menu_id
      LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
      WHERE o.table_id = ? AND o.status != 'ชำระเงินแล้ว'
    `;

      // รันคำสั่ง SQL
      const [orders] = await db.query(query, [tableId]);

      // ตรวจสอบว่าไม่มีออร์เดอร์
      if (orders.length === 0) {
        return res.status(404).json({ error: "ไม่มีออร์เดอร์สำหรับโต๊ะนี้" });
      }

      // ส่งผลลัพธ์ที่ได้รับ
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

  // ✅ ฟังก์ชันตัดสต็อกแบบ FIFO
  const reduceStockFIFO = async (recipe_id, quantity) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // 🔍 ดึงวัตถุดิบที่ต้องใช้
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
          // 🔍 ค้นหาล็อตวัตถุดิบที่มีสต็อก
          const [batch] = await connection.query(
            `SELECT batch_id, quantity - used_quantity AS available 
             FROM inventory_batches 
             WHERE material_id = ? AND status = 'available' 
             ORDER BY received_date ASC, batch_id ASC 
             LIMIT 1 LOCK IN SHARE MODE`,
            [material_id]
          );

          if (!batch.length) {
            console.warn(
              `⚠ ไม่มีล็อตวัตถุดิบ ${material_id}, ใช้ stock จาก materials แทน`
            );

            // 🔍 ตรวจสอบ stock จาก materials
            const [stockResult] = await connection.query(
              "SELECT stock FROM materials WHERE material_id = ? FOR UPDATE",
              [material_id]
            );

            if (
              !stockResult.length ||
              Number(stockResult[0].stock) < Number(remaining)
            ) {
              console.error(
                `❌ สต็อกหมดสำหรับวัตถุดิบ ${material_id}, คงเหลือ: ${stockResult[0].stock}, ต้องการ: ${remaining}`
              );
              throw new Error(`❌ สต็อกหมดสำหรับวัตถุดิบ ${material_id}`);
            }

            // 🔻 อัปเดต stock ของ materials
            const stockToUse = Math.min(remaining, stockResult[0].stock);
            await connection.query(
              "UPDATE materials SET stock = GREATEST(stock - ?, 0) WHERE material_id = ?",
              [stockToUse, material_id]
            );

            console.log(
              `✅ ตัดสต็อก ${stockToUse} หน่วยจาก materials (material_id: ${material_id})`
            );
            break;
          }

          const { batch_id, available } = batch[0];
          const used = Math.min(remaining, available);
          remaining -= used;

          // ✅ อัปเดตการใช้วัตถุดิบในล็อต
          await connection.query(
            `UPDATE inventory_batches 
             SET used_quantity = used_quantity + ?, 
                 status = CASE WHEN (quantity - used_quantity - ?) <= 0 THEN 'depleted' ELSE 'available' END
             WHERE batch_id = ?`,
            [used, used, batch_id]
          );

          console.log(
            `✅ ตัดสต็อก ${used} หน่วยจาก batch_id: ${batch_id} (material_id: ${material_id})`
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

  // ✅ สั่งอาหาร (แบบรายการเดียว)
  router.post("/", async (req, res) => {
    const { table_id, menu_id, quantity = 1, price } = req.body;

    if (!table_id || !menu_id || !price) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
      // ตรวจสอบเมนูและสต็อก
      const [menu] = await db.query(
        `SELECT recipe_id FROM menus WHERE menu_id = ?`,
        [menu_id]
      );
      if (!menu.length)
        return res
          .status(404)
          .json({ success: false, message: "ไม่พบเมนูนี้" });

      const recipe_id = menu[0].recipe_id;
      const isAvailable = await checkStockAvailability(recipe_id, quantity);
      if (!isAvailable) {
        return res
          .status(400)
          .json({ success: false, message: "❌ วัตถุดิบไม่เพียงพอ" });
      }

      // ✅ สร้างออเดอร์
      const [orderResult] = await db.query(
        `INSERT INTO orders (table_id, total_price, status, session_id) 
           VALUES (?, ?, 'กำลังเตรียม', ?)`,
        [table_id, price * quantity, "session123"]
      );

      const order_id = orderResult.insertId;

      // ✅ เพิ่มข้อมูลลง order_items
      await db.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, subtotal) 
           VALUES (?, ?, ?, ?)`,
        [order_id, menu_id, quantity, price * quantity]
      );

      // ✅ ตัดสต็อกแบบ FIFO
      await reduceStockFIFO(recipe_id, quantity);

      io.emit("new_order", { table_id, menu_id, quantity });
      res.status(201).json({ success: true, message: "สั่งอาหารสำเร็จ!" });
    } catch (error) {
      console.error("❌ Error placing order:", error);
      res
        .status(500)
        .json({ success: false, message: "เกิดข้อผิดพลาดในการสั่งอาหาร" });
    }
  });

  router.post("/bulk", async (req, res) => {
    const { table_id, orders, session_id } = req.body;

    if (!table_id || !orders || orders.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
    }

    try {
      await db.query("START TRANSACTION");

      let order_id = null;

      // ✅ 1. เช็กว่าต้องสร้าง `order_id` หรือไม่ (ใช้สำหรับรายงาน)
      const [existingOrder] = await db.query(
        `SELECT order_id FROM orders WHERE table_id = ? AND status = 'กำลังเตรียม' LIMIT 1`,
        [table_id]
      );

      if (existingOrder.length) {
        order_id = existingOrder[0].order_id;
      } else {
        const [newOrder] = await db.query(
          `INSERT INTO orders (table_id, total_price, status, session_id) 
           VALUES (?, 0, 'กำลังเตรียม', ?)`,
          [table_id, session_id]
        );
        order_id = newOrder.insertId;
      }

      // ✅ 2. เพิ่มแต่ละเมนูลง `order_items` โดยไม่อิง `order_id`
      const orderItemIds = [];

      for (const { menu_id, quantity, price } of orders) {
        console.log("📌 Processing menu_id:", menu_id);

        // ✅ ดึง recipe_id เพื่อตรวจสอบวัตถุดิบ
        const [menuData] = await db.query(
          "SELECT recipe_id FROM menus WHERE menu_id = ?",
          [menu_id]
        );

        if (!menuData.length) {
          throw new Error(`❌ ไม่พบเมนู ${menu_id}`);
        }

        const recipe_id = menuData[0].recipe_id;
        const isAvailable = await checkStockAvailability(recipe_id, quantity);
        if (!isAvailable) {
          throw new Error(`❌ วัตถุดิบไม่เพียงพอสำหรับเมนู ${menu_id}`);
        }

        // ✅ บันทึก `order_items` โดยใช้ `order_item_id` เป็นหลัก
        const [orderItem] = await db.query(
          `INSERT INTO order_items (order_id, menu_id, quantity, subtotal, table_id, session_id) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [order_id, menu_id, quantity, price * quantity, table_id, session_id]
        );

        orderItemIds.push(orderItem.insertId);

        // ✅ ตัดสต็อก
        await reduceStockFIFO(recipe_id, quantity);
      }

      await db.query("COMMIT");

      io.emit("new_order", { table_id, orders });

      res
        .status(201)
        .json({
          success: true,
          message: "สั่งอาหารสำเร็จ!",
          order_items: orderItemIds,
        });
    } catch (error) {
      await db.query("ROLLBACK");
      console.error("❌ Error placing order:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.put("/confirm-payment", async (req, res) => {
    const { table_id } = req.body;
    if (!table_id) {
      return res
        .status(400)
        .json({ success: false, message: "ต้องระบุ table_id" });
    }

    try {
      const connection = await db.getConnection();
      await connection.beginTransaction();

      // 🔍 ค้นหาออเดอร์ที่ต้องชำระเงิน
      const [orders] = await connection.query(
        `SELECT oi.menu_id, oi.quantity, m.recipe_id 
         FROM orders o 
         JOIN order_items oi ON o.order_id = oi.order_id 
         JOIN menus m ON oi.menu_id = m.menu_id
         WHERE o.table_id = ? AND o.status = 'กำลังเตรียม'`,
        [table_id]
      );

      if (orders.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: "ไม่มีออเดอร์ที่ต้องชำระเงิน" });
      }

      // ✅ ตัดสต็อกของทุกเมนูในออเดอร์
      for (const order of orders) {
        await reduceStockFIFO(order.recipe_id, order.quantity);
      }

      // ✅ เปลี่ยนสถานะเป็น "ชำระเงินแล้ว"
      await connection.query(
        "UPDATE orders SET status = 'ชำระเงินแล้ว' WHERE table_id = ?",
        [table_id]
      );

      await connection.commit();
      connection.release();

      io.emit("order_paid", { table_id });

      res.json({
        success: true,
        message: "✅ ชำระเงินสำเร็จ! สต็อกถูกอัปเดตแล้ว",
      });
    } catch (error) {
      await db.query("ROLLBACK");
      console.error("❌ Error confirming payment:", error);
      res.status(500).json({
        success: false,
        message: "เกิดข้อผิดพลาดในการยืนยันการชำระเงิน",
        error: error.message,
      });
    }
  });

  router.delete("/:orderId", async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID ไม่ถูกต้อง" });
    }

    try {
      // ลบรายการ order_items ที่เกี่ยวข้องก่อน
      await db.query("DELETE FROM order_items WHERE order_id = ?", [orderId]);

      // จากนั้นลบออร์เดอร์
      const [result] = await db.query("DELETE FROM orders WHERE order_id = ?", [
        orderId,
      ]);

      if (result.affectedRows > 0) {
        return res.json({ success: true, message: "ลบออร์เดอร์สำเร็จ" });
      } else {
        return res
          .status(404)
          .json({ success: false, message: "ไม่พบออร์เดอร์" });
      }
    } catch (error) {
      console.error("❌ ลบออร์เดอร์ผิดพลาด:", error);
      return res
        .status(500)
        .json({ success: false, message: "เกิดข้อผิดพลาดในการลบออร์เดอร์" });
    }
  });

  // ✅ Route สำหรับยกเลิกออร์เดอร์ (ลบตาม `order_item_id`)
  router.delete("/item/:orderItemId", async (req, res) => {
    const { orderItemId } = req.params;

    try {
        const [result] = await db.query("DELETE FROM order_items WHERE order_item_id = ?", [orderItemId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบออร์เดอร์ที่ต้องการลบ" });
        }

        res.json({ success: true, message: "ออร์เดอร์ถูกยกเลิกแล้ว" });
    } catch (error) {
        console.error("❌ Error deleting order item:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบออร์เดอร์" });
    }
});

  return router;
};
