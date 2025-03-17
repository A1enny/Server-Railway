const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");

router.get("/", inventoryController.getMaterials);
router.get("/:id", inventoryController.getMaterialById);
router.post("/", inventoryController.addMaterial);
router.delete("/:id", inventoryController.deleteMaterial);

module.exports = router;
