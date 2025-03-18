const InventoryModel = require("../models/inventoryModel");

// ✅ ดึงข้อมูลวัตถุดิบทั้งหมด (รองรับการค้นหาและกรอง)
exports.getMaterials = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : "%";
    const category = req.query.category || "%";

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
    const {
      name, category_id, quantity, received_date, expiration_date, price, unit
    } = req.body;
  
    if (!name || !category_id || !quantity || !received_date || !price || !unit) {
      return res.status(400).json({ error: "❌ Missing required fields" });
    }
  
    try {
      const getUnitId = async (unitName) => {
        const [rows] = await db.query("SELECT unit_id FROM unit WHERE unit_name = ?", [unitName]);
        return rows.length ? rows[0].unit_id : null;
      };
      
  
      let finalExpirationDate = expiration_date;
  
      // ✅ ถ้าไม่ได้ระบุวันหมดอายุ ให้คำนวณจาก shelf_life
      if (!expiration_date) {
        const [shelfLifeRow] = await db.query(
          `SELECT shelf_life_days FROM shelf_life WHERE category_id = ?`,
          [category_id]
        );
        if (shelfLifeRow.length > 0) {
          finalExpirationDate = new Date(received_date);
          finalExpirationDate.setDate(finalExpirationDate.getDate() + shelfLifeRow[0].shelf_life_days);
        } else {
          return res.status(400).json({ error: "❌ Shelf life not found for this category" });
        }
      }
  
      const result = await InventoryModel.addMaterial({
        name, category_id, quantity, received_date, expiration_date: finalExpirationDate, price, unit_id
      });
  
      res.status(201).json({ success: true, material_id: result.insertId });
    } catch (error) {
      console.error("❌ Error adding material:", error);
      res.status(500).json({ error: "❌ Failed to add material" });
    }
  };
    

// ✅ เพิ่มวัตถุดิบแบบล็อต (batch)
exports.addBatch = async (req, res) => {
    const { batch } = req.body;
    
    if (!batch || !Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ error: "❌ Invalid batch data" });
    }
  
    try {
      const batchData = await Promise.all(
        batch.map(async (item) => {
          const unit_id = await InventoryModel.getUnitId(item.unit);
          if (!unit_id) throw new Error("❌ Invalid unit");
  
          let finalExpirationDate = item.expiration_date;
  
          // ✅ คำนวณวันหมดอายุถ้าไม่มีการระบุ
          if (!finalExpirationDate) {
            const [shelfLifeRow] = await db.query(
              `SELECT shelf_life_days FROM shelf_life WHERE category_id = ?`,
              [item.category_id]
            );
            if (shelfLifeRow.length > 0) {
              finalExpirationDate = new Date(item.received_date);
              finalExpirationDate.setDate(finalExpirationDate.getDate() + shelfLifeRow[0].shelf_life_days);
            } else {
              throw new Error("❌ Shelf life not found for this category");
            }
          }
  
          return {
            name: item.name,
            category_id: item.category_id,
            quantity: item.quantity,
            received_date: item.received_date,
            expiration_date: finalExpirationDate,
            price: item.price,
            unit_id: unit_id,
          };
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
  
