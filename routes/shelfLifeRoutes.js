const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/:category_id", async (req, res) => {
  try {
    const { category_id } = req.params;
    const query = "SELECT shelf_life_days FROM shelf_life WHERE category_id = ?";
    const [rows] = await db.query(query, [category_id]);

    if (rows.length > 0) {
      res.json({ shelf_life_days: rows[0].shelf_life_days });
    } else {
      res.status(404).json({ error: "ไม่พบข้อมูล shelf life" });
    }
  } catch (error) {
    res.status(500).json({ error: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  }
});

module.exports = router; // ✅ ต้อง export router ออกไป
