const InventoryModel = require("../models/inventoryModel");

exports.getMaterials = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : "%";
    const category = req.query.category || "%";

    const { total, rows } = await InventoryModel.getMaterials({ search, category, limit, offset });

    res.json({
      success: true,
      results: rows,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("❌ Error fetching materials:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลวัตถุดิบ" });
  }
};

exports.getMaterialById = async (req, res) => {
  try {
    const material = await InventoryModel.getMaterialById(req.params.id);
    if (!material) {
      return res.status(404).json({ error: "❌ Material not found" });
    }
    res.json({ success: true, material });
  } catch (error) {
    console.error("❌ Error fetching material:", error);
    res.status(500).json({ error: "❌ Error fetching material" });
  }
};

exports.addMaterial = async (req, res) => {
  try {
    const { name, category_id, quantity, received_date, expiration_date, price } = req.body;
    if (!name || !category_id) {
      return res.status(400).json({ error: "❌ กรุณากรอกชื่อและเลือกหมวดหมู่" });
    }
    const materialId = await InventoryModel.addMaterial({
      name,
      category_id,
      quantity,
      received_date,
      expiration_date,
      price,
    });

    res.status(201).json({
      success: true,
      message: "✅ เพิ่มวัตถุดิบสำเร็จ!",
      material_id: materialId,
    });
  } catch (error) {
    console.error("❌ Error adding material:", error);
    res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการเพิ่มวัตถุดิบ" });
  }
};

exports.deleteMaterial = async (req, res) => {
  try {
    await InventoryModel.deleteMaterial(req.params.id);
    res.json({ success: true, message: "✅ ลบวัตถุดิบสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error deleting material:", error);
    res.status(500).json({ error: "❌ ลบวัตถุดิบไม่สำเร็จ" });
  }
};
exports.addMaterial = async (req, res) => {
    try {
      const { name, category_id, quantity, received_date, expiration_date, price, unit } = req.body;
      if (!name || !category_id || !quantity || !expiration_date || !price || !unit) {
        return res.status(400).json({ error: "❌ กรุณากรอกข้อมูลให้ครบ" });
      }
  
      const materialId = await InventoryModel.addMaterial({
        name,
        category_id,
        quantity,
        received_date,
        expiration_date,
        price,
        unit,
      });
  
      res.status(201).json({
        success: true,
        message: "✅ เพิ่มวัตถุดิบสำเร็จ!",
        material_id: materialId,
      });
    } catch (error) {
      console.error("❌ Error adding material:", error);
      res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการเพิ่มวัตถุดิบ" });
    }
  };
  
  // ✅ เพิ่มวัตถุดิบแบบล็อต (batch)
  exports.addBatchMaterials = async (req, res) => {
    try {
      const { batch } = req.body;
  
      if (!Array.isArray(batch) || batch.length === 0) {
        return res.status(400).json({ error: "❌ กรุณาเพิ่มข้อมูลวัตถุดิบในล็อต" });
      }
  
      const insertedCount = await InventoryModel.addBatchMaterials(batch);
  
      res.status(201).json({
        success: true,
        message: `✅ เพิ่มวัตถุดิบล็อตสำเร็จ! จำนวน ${insertedCount} รายการ`,
      });
    } catch (error) {
      console.error("❌ Error adding batch materials:", error);
      res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการเพิ่มวัตถุดิบล็อต" });
    }
  };