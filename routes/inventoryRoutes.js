const express = require("express");
const inventoryController = require("../controllers/inventoryController");

module.exports = (io) => {
  const router = express.Router();

  // ✅ API ดึงข้อมูลวัตถุดิบ
  router.get("/most-used", (req, res) => inventoryController.getMostUsedMaterials(req, res, io));
  router.get("/usage-stats", (req, res) => inventoryController.getUsageStats(req, res, io));
  router.get("/", (req, res) => inventoryController.getMaterials(req, res, io));
  router.get("/:id", (req, res) => inventoryController.getMaterialById(req, res, io));
  
  // ✅ API เพิ่มข้อมูล
  router.post("/", (req, res) => inventoryController.addMaterial(req, res, io));
  router.post("/batch", (req, res) => inventoryController.addBatch(req, res, io));

  // ✅ API อัปเดตและลบข้อมูล
  router.post("/update-stock", (req, res) => inventoryController.updateStock(req, res, io));
  router.delete("/:id", (req, res) => inventoryController.deleteMaterial(req, res, io));
  router.delete("/batch/:batchId", (req, res) => inventoryController.deleteBatch(req, res, io));

  // ✅ API ดูล็อตของวัตถุดิบ
  router.get("/:id/batches", (req, res) => inventoryController.getMaterialBatches(req, res, io));

  return router;
};
