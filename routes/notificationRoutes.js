const express = require("express");
const router = express.Router();
const db = require("../config/db.js");

// ✅ API: ดึงการแจ้งเตือนทั้งหมด
router.get("/", async (req, res) => {
  try {
    const [notifications] = await db.query(`
      SELECT 'ออเดอร์ใหม่' AS type, 
             CONCAT('โต๊ะ ', o.table_id, ' มีออเดอร์ใหม่') AS message,
             o.created_at AS time
      FROM orders o
      WHERE o.order_id IN (SELECT DISTINCT order_id FROM order_items)
      
      UNION ALL
      
      SELECT 'ออเดอร์เสร็จสมบูรณ์' AS type, 
             CONCAT('โต๊ะ ', o.table_id, ' ออเดอร์ถูกเสิร์ฟแล้ว') AS message,
             o.updated_at AS time
      FROM orders o
      WHERE o.status = 'เสร็จสมบูรณ์'

      UNION ALL

      SELECT 'ออเดอร์ถูกยกเลิก' AS type, 
             CONCAT('ออเดอร์จากโต๊ะ ', o.table_id, ' ถูกยกเลิก') AS message,
             o.updated_at AS time
      FROM orders o
      WHERE o.status = 'ถูกยกเลิก'

      UNION ALL

      SELECT 'โต๊ะต้องทำความสะอาด' AS type, 
             CONCAT('โต๊ะ ', t.table_id, ' ต้องทำความสะอาด') AS message,
             t.updated_at AS time
      FROM tables t
      WHERE t.status = 'ต้องทำความสะอาด'

      UNION ALL

      SELECT 'วัตถุดิบหมด' AS type, 
             CONCAT(m.name, ' หมดคลังแล้ว') AS message,
             m.updated_at AS time
      FROM materials m
      WHERE m.stock = 0

      UNION ALL
      
      SELECT 'วัตถุดิบใกล้หมด' AS type, 
             CONCAT(m.name, ' เหลือ ', m.stock, ' หน่วย') AS message,
             m.updated_at AS time
      FROM materials m
      WHERE m.stock <= m.min_stock

      UNION ALL
      
      SELECT 'วัตถุดิบใกล้หมดอายุ' AS type, 
             CONCAT(m.name, ' ใกล้หมดอายุ (', DATE_FORMAT(m.expiration_date, '%d/%m/%Y'), ')') AS message,
             m.expiration_date AS time
      FROM materials m
      WHERE m.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)

      ORDER BY time DESC
      LIMIT 10;
    `);

    res.json({ success: true, results: notifications });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงการแจ้งเตือน" });
  }
});

module.exports = router;
