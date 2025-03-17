const express = require("express");
const router = express.Router();
const {
  getMaterials,
  getMaterialById,
  addMaterial,
  deleteMaterial,
} = require("../controllers/inventoryController");

router.get("/", getMaterials);
router.get("/:id", getMaterialById);
router.post("/", addMaterial);
router.delete("/:id", deleteMaterial);

module.exports = router;
