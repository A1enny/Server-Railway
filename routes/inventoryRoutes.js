const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");

module.exports = (io) => {
  router.get("/", inventoryController.getMaterials);
  router.get("/:id", inventoryController.getMaterialById);
  router.post("/", inventoryController.addMaterial);
  router.post("/batch", inventoryController.addBatchMaterials);
  router.delete("/:id", inventoryController.deleteMaterial);

  // ✅ เส้นทางใหม่
  router.get("/:id/batches", inventoryController.getMaterialBatches); // ดูล็อตของวัตถุดิบ
  router.delete("/batch/:batchId", inventoryController.deleteBatch); // ลบล็อตวัตถุดิบ
  router.post("/update-stock", inventoryController.updateStock); // อัปเดตสต็อกอัตโนมัติ
  router.get("/most-used", inventoryController.getMostUsedMaterials); // ดูวัตถุดิบที่ใช้บ่อยที่สุด
  router.get("/usage-stats", inventoryController.getUsageStats);

  return router;
};
