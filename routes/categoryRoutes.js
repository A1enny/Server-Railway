const express = require("express");
const router = express.Router();
const db = require("../config/db.js");

// ✅ ดึงข้อมูลหมวดหมู่ทั้งหมด
router.get("/", async (req, res) => {
  try {
    const sql = "SELECT category_id, category_name FROM categories ORDER BY category_name ASC";
    const [results] = await db.query(sql);
    res.json(results);
  } catch (error) {
    console.error("❌ Database Query Error:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
  }
});

router.get("/default", async (req, res) => {
  try {
    const [category] = await db.query("SELECT category_id FROM categories ORDER BY category_id ASC LIMIT 1");
    if (category.length > 0) {
      res.json(category[0]);
    } else {
      res.json({ category_id: 1 }); // ถ้าไม่มีหมวดหมู่ ให้ตั้งค่าเป็น 1
    }
  } catch (error) {
    console.error("❌ Error fetching default category:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงหมวดหมู่เริ่มต้น" });
  }
});


module.exports = router;
