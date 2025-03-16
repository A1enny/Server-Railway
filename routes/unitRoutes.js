const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ✅ ดึงข้อมูลหน่วยวัดทั้งหมด
router.get("/", async (req, res) => {
  try {
    const [units] = await db.query("SELECT unit_id, unit_name FROM unit");
    res.json({ results: units });
  } catch (error) {
    console.error("❌ Error fetching units:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลหน่วยวัด" });
  }
});

module.exports = router;
