const express = require("express");
const inventoryController = require("../controllers/inventoryController");

module.exports = (io) => {
  const router = express.Router();

  // ✅ เส้นทางที่ไม่มีไอดี ต้องมาก่อน
  router.get("/most-used", (req, res) => inventoryController.getMostUsedMaterials(req, res, io));
  router.get("/usage-stats", (req, res) => inventoryController.getUsageStats(req, res, io));

  router.get("/", (req, res) => inventoryController.getMaterials(req, res, io));
  router.post("/", (req, res) => inventoryController.addMaterial(req, res, io));
  router.post("/batch", (req, res) => inventoryController.addBatchMaterials(req, res, io));

  // ✅ API การอัปเดตและลบข้อมูล
  router.delete("/:id", (req, res) => inventoryController.deleteMaterial(req, res, io));
  router.delete("/batch/:batchId", (req, res) => inventoryController.deleteBatch(req, res, io));

  // ✅ API ดูล็อตของวัตถุดิบ
  router.get("/:id/batches", (req, res) => inventoryController.getMaterialBatches(req, res, io));

  // ✅ API อัปเดตสต็อกอัตโนมัติ
  router.post("/update-stock", (req, res) => inventoryController.updateStock(req, res, io));

  // ✅ API ดูวัตถุดิบตามไอดี
  router.get("/:id", (req, res) => inventoryController.getMaterialById(req, res, io));

  return router;
};
