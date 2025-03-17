const InventoryModel = require("../models/inventoryModel");

// ✅ ดึงข้อมูลวัตถุดิบทั้งหมด (รองรับการค้นหาและกรอง)
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

// ✅ ดึงข้อมูลวัตถุดิบตาม ID
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

// ✅ เพิ่มวัตถุดิบแบบเดี่ยว
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
      received_date: received_date || new Date(),
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

    for (const item of batch) {
      if (!item.name || !item.category_id || !item.quantity || !item.expiration_date || !item.price || !item.unit) {
        return res.status(400).json({ error: "❌ กรุณากรอกข้อมูลในแต่ละรายการให้ครบ" });
      }
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

// ✅ ลบวัตถุดิบ
exports.deleteMaterial = async (req, res) => {
  try {
    await InventoryModel.deleteMaterial(req.params.id);
    res.json({ success: true, message: "✅ ลบวัตถุดิบสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error deleting material:", error);
    res.status(500).json({ error: "❌ ลบวัตถุดิบไม่สำเร็จ" });
  }
};

// ✅ ดึงล็อตของวัตถุดิบแยกตามการนำเข้า
exports.getMaterialBatches = async (req, res) => {
  try {
    const materialId = req.params.id;
    const batches = await InventoryModel.getMaterialBatches(materialId);

    if (!batches || batches.length === 0) {
      return res.status(404).json({ error: "❌ ไม่พบข้อมูลล็อตของวัตถุดิบนี้" });
    }

    res.json({ success: true, batches });
  } catch (error) {
    console.error("❌ Error fetching material batches:", error);
    res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการดึงข้อมูลล็อตวัตถุดิบ" });
  }
};

// ✅ ลบวัตถุดิบแบบล็อต
exports.deleteBatch = async (req, res) => {
  try {
    const batchId = req.params.batchId;
    await InventoryModel.deleteBatch(batchId);

    res.json({ success: true, message: "✅ ลบล็อตของวัตถุดิบสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error deleting batch:", error);
    res.status(500).json({ error: "❌ ลบล็อตวัตถุดิบไม่สำเร็จ" });
  }
};

// ✅ อัปเดตสต็อกอัตโนมัติเมื่อมีการใช้งาน
exports.updateStock = async (req, res) => {
  try {
    const { material_id, quantity_used } = req.body;

    if (!material_id || !quantity_used) {
      return res.status(400).json({ error: "❌ กรุณาระบุรหัสวัตถุดิบและจำนวนที่ใช้" });
    }

    const updated = await InventoryModel.updateStock(material_id, quantity_used);

    if (!updated) {
      return res.status(404).json({ error: "❌ วัตถุดิบไม่พบ หรือสต็อกไม่พอ" });
    }

    res.json({ success: true, message: "✅ อัปเดตสต็อกสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error updating stock:", error);
    res.status(500).json({ error: "❌ อัปเดตสต็อกไม่สำเร็จ" });
  }
};

// ✅ แสดงวัตถุดิบที่ใช้บ่อยที่สุด
exports.getMostUsedMaterials = async (req, res) => {
  try {
    const materials = await InventoryModel.getMostUsedMaterials();
    res.json({ success: true, materials });
  } catch (error) {
    console.error("❌ Error fetching most used materials:", error);
    res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการดึงข้อมูลวัตถุดิบที่ใช้บ่อย" });
  }
};
