const db = require("../config/db");
const InventoryModel = require("../models/inventoryModel");

// ✅ ดึงข้อมูลวัตถุดิบทั้งหมด (รองรับการค้นหาและกรอง)
exports.getMaterials = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : "%";
    const category = req.query.category || null;

    console.log(`🔍 Fetching materials... Search: ${search}, Category: ${category}`);

    const { total, rows } = await InventoryModel.getMaterials({
      search,
      category,
      limit,
      offset,
    });

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
    let { name, category_id, quantity, received_date, expiration_date, price, unit } = req.body;

    // ✅ ตรวจสอบค่าที่รับเข้ามา
    quantity = Number(quantity);
    price = Number(price);
    if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) {
      return res.status(400).json({ error: "❌ Quantity and Price must be valid numbers" });
    }

    // ✅ ถ้าไม่ได้ระบุ received_date ให้ใช้วันที่ปัจจุบัน
    received_date = received_date || new Date().toISOString().split("T")[0];

    // ✅ ดึง unit_id
    const [unitRow] = await db.query("SELECT unit_id FROM unit WHERE unit_name = ?", [unit]);
    if (!unitRow.length) {
      return res.status(400).json({ error: `❌ Unit '${unit}' not found` });
    }
    const unit_id = unitRow[0].unit_id;

    // ✅ คำนวณวันหมดอายุถ้าไม่ได้ระบุ
    if (!expiration_date) {
      const [shelfLifeRow] = await db.query(
        "SELECT shelf_life_days FROM shelf_life WHERE category_id = ?",
        [category_id]
      );
      if (shelfLifeRow.length > 0) {
        expiration_date = new Date(received_date);
        expiration_date.setDate(expiration_date.getDate() + shelfLifeRow[0].shelf_life_days);
        expiration_date = expiration_date.toISOString().split("T")[0];
      } else {
        return res.status(400).json({ error: "❌ Shelf life not found for this category" });
      }
    }

    // ✅ บันทึกข้อมูล
    const material_id = await InventoryModel.addMaterial({
      name,
      category_id,
      quantity,
      received_date,
      expiration_date,
      price,
      unit_id,
    });

    res.status(201).json({ success: true, material_id });
  } catch (error) {
    console.error("❌ Error adding material:", error);
    res.status(500).json({ error: "❌ Failed to add material" });
  }
};

// ✅ เพิ่มวัตถุดิบแบบล็อต (batch)
exports.addBatch = async (req, res) => {
  try {
    const { batch } = req.body;
    if (!batch || !Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ error: "❌ Invalid batch data" });
    }

    // ✅ ใช้ Promise.all() เพื่อเร่งประสิทธิภาพ
    const batchData = await Promise.all(
      batch.map(async (item) => {
        let { name, category_id, quantity, received_date, expiration_date, price, unit } = item;

        // ✅ แปลงค่าให้ถูกต้อง
        quantity = Number(quantity);
        price = Number(price);
        if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) {
          throw new Error("❌ Quantity and Price must be valid numbers");
        }

        // ✅ ถ้าไม่ได้ระบุ received_date ให้ใช้วันที่ปัจจุบัน
        received_date = received_date || new Date().toISOString().split("T")[0];

        // ✅ ดึง unit_id
        const [unitRow] = await db.query("SELECT unit_id FROM unit WHERE unit_name = ?", [unit]);
        if (!unitRow.length) {
          throw new Error(`❌ Unit '${unit}' not found`);
        }
        const unit_id = unitRow[0].unit_id;

        // ✅ คำนวณวันหมดอายุถ้าไม่ได้ระบุ
        if (!expiration_date) {
          const [shelfLifeRow] = await db.query(
            "SELECT shelf_life_days FROM shelf_life WHERE category_id = ?",
            [category_id]
          );
          if (shelfLifeRow.length > 0) {
            expiration_date = new Date(received_date);
            expiration_date.setDate(expiration_date.getDate() + shelfLifeRow[0].shelf_life_days);
            expiration_date = expiration_date.toISOString().split("T")[0];
          } else {
            throw new Error("❌ Shelf life not found for this category");
          }
        }

        return { name, category_id, quantity, received_date, expiration_date, price, unit_id };
      })
    );

    await InventoryModel.addBatch(batchData);
    res.status(201).json({ success: true, message: "✅ Batch added successfully" });
  } catch (error) {
    console.error("❌ Error adding batch:", error);
    res.status(500).json({ error: "❌ Failed to add batch" });
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
      return res
        .status(404)
        .json({ error: "❌ ไม่พบข้อมูลล็อตของวัตถุดิบนี้" });
    }

    res.json({ success: true, batches });
  } catch (error) {
    console.error("❌ Error fetching material batches:", error);
    res
      .status(500)
      .json({ error: "❌ เกิดข้อผิดพลาดในการดึงข้อมูลล็อตวัตถุดิบ" });
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
      return res
        .status(400)
        .json({ error: "❌ กรุณาระบุรหัสวัตถุดิบและจำนวนที่ใช้" });
    }

    const updated = await InventoryModel.updateStock(
      material_id,
      quantity_used
    );

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
    res
      .status(500)
      .json({ error: "❌ เกิดข้อผิดพลาดในการดึงข้อมูลวัตถุดิบที่ใช้บ่อย" });
  }
};

exports.getUsageStats = async (req, res) => {
  try {
    const stats = await InventoryModel.getUsageStatistics();
    if (!stats) {
      return res.status(404).json({ error: "No usage stats found" });
    }
    res.json({ success: true, stats });
  } catch (error) {
    console.error("❌ Error fetching usage stats:", error);
    res.status(500).json({ error: "Failed to fetch usage stats" });
  }
};
