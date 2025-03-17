const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");

module.exports = (io) => {
    router.get("/", inventoryController.getMaterials);
    router.get("/:id", inventoryController.getMaterialById);
    router.post("/", inventoryController.addMaterial);
    router.post("/batch", inventoryController.addBatchMaterials);
    router.delete("/:id", inventoryController.deleteMaterial);

    return router;
};
