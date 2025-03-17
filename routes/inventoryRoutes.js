const express = require("express");
const router = express.Router();
const db = require("../config/db");
const {
  getMaterials,
  getMaterialById,
  addMaterial,
  addBatchMaterials,
  deleteMaterial,
} = require("../controllers/inventoryController");

// ✅ ดึงข้อมูลวัตถุดิบทั้งหมด (รองรับการค้นหาและกรอง)
router.get("/", getMaterials);

// ✅ ดึงข้อมูลวัตถุดิบตาม ID
router.get("/:id", getMaterialById);

// ✅ เพิ่มวัตถุดิบแบบเดี่ยว
router.post("/", addMaterial);

// ✅ เพิ่มวัตถุดิบแบบล็อต
router.post("/batch", addBatchMaterials);

// ✅ ลบวัตถุดิบ
router.delete("/:id", deleteMaterial);

module.exports = router;
