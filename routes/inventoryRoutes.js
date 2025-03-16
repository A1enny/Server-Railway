const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ✅ ดึงข้อมูลล็อตวัตถุดิบทั้งหมด
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        ib.batch_id,
        ib.material_id,
        m.name AS material_name,
        c.category_name,
        ib.quantity,
        ib.used_quantity,
        (ib.quantity - ib.used_quantity) AS remaining_quantity,
        ib.received_date,
        ib.expiration_date,
        ib.price,
        ib.status
      FROM inventory_batches ib
      LEFT JOIN materials m ON ib.material_id = m.material_id
      LEFT JOIN categories c ON m.category_id = c.category_id
      ORDER BY ib.batch_id ASC
    `);

    console.log("📌 ล็อตวัตถุดิบทั้งหมด:", rows);
    res.json({ results: rows });
  } catch (error) {
    console.error("❌ Error fetching batch inventory:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลล็อตวัตถุดิบ" });
  }
});

// 📌 ดึงข้อมูลสินค้าหมดสต็อก
router.get("/low-stock", async (req, res) => {
  try {
    const lowStockQuery = `
      SELECT 
  material_id, 
  name AS material_name, 
  stock AS current_quantity, 
  min_stock
FROM materials
WHERE stock < min_stock;
`;

    const [lowStockData] = await db.query(lowStockQuery);
    res.json(lowStockData);
  } catch (error) {
    console.error("Error fetching low stock items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ ดึงข้อมูลล็อตวัตถุดิบตาม batch_id
router.get("/:batch_id", async (req, res) => {
  const { batch_id } = req.params;
  try {
    const [rows] = await db.query(
      `
      SELECT 
        bm.batch_id,
        bm.material_id,
        m.name AS material_name,
        bm.quantity,
        bm.price,
        ib.received_date,
        ib.expiration_date
      FROM batch_materials bm
      LEFT JOIN materials m ON bm.material_id = m.material_id
      LEFT JOIN inventory_batches ib ON bm.batch_id = ib.batch_id
      WHERE bm.batch_id = ?;
    `,
      [batch_id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "❌ ไม่พบข้อมูลล็อตนี้ หรือยังไม่มีวัตถุดิบในล็อต" });
    }

    res.json({ results: rows });
  } catch (error) {
    console.error("❌ Error fetching batch details:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลล็อต" });
  }
});

// ✅ เพิ่มวัตถุดิบใหม่หรืออัปเดตล็อตที่มีอยู่แล้ว
router.post("/", async (req, res) => {
  let {
    name,
    category_id,
    unit_id,
    quantity,
    received_date,
    expiration_date,
    price,
    batch_id,
  } = req.body;

  console.log("📌 ข้อมูลที่ได้รับจาก Frontend:", req.body);

  if (
    !name ||
    !category_id ||
    !unit_id ||
    isNaN(quantity) ||
    quantity <= 0 ||
    isNaN(price) ||
    price < 0
  ) {
    return res.status(400).json({ error: "❌ ข้อมูลไม่ถูกต้อง" });
  }
  // ✅ ถ้า unit_id เป็นค่าว่าง ให้กำหนดเป็นค่า default = 1
  if (!unit_id || isNaN(unit_id)) {
    unit_id = 1;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    let materialId;
    let selectedBatchId = batch_id;

    // 🔍 **ตรวจสอบวัตถุดิบว่ามีอยู่แล้วหรือไม่**
    const [existingMaterial] = await connection.query(
      `SELECT material_id FROM materials WHERE name = ? AND category_id = ? AND unit_id = ?`,
      [name, category_id, unit_id]
    );

    if (existingMaterial.length > 0) {
      materialId = existingMaterial[0].material_id;
    } else {
      // ✅ **เพิ่มวัตถุดิบใหม่ถ้ายังไม่มี**
      const [result] = await connection.query(
        `INSERT INTO materials (name, category_id, unit_id, stock) VALUES (?, ?, ?, ?);`,
        [name, category_id, unit_id, 0]
      );
      materialId = result.insertId;
    }

    // 🔍 **ตรวจสอบล็อตที่มีอยู่ โดยคำนึงถึง material_id**
    if (!selectedBatchId) {
      const [existingBatch] = await connection.query(
        `SELECT batch_id FROM inventory_batches 
     WHERE material_id = ? AND received_date = ? AND expiration_date = ?`,
        [materialId, received_date, expiration_date]
      );

      if (existingBatch.length > 0) {
        selectedBatchId = existingBatch[0].batch_id;
      } else {
        // ✅ **ถ้าไม่มีล็อต ให้สร้างใหม่**
        const [batchResult] = await connection.query(
          `INSERT INTO inventory_batches (material_id, quantity, received_date, expiration_date, price) 
   VALUES (?, ?, ?, ?, ?);`,
          [
            materialId,
            quantity,
            received_date || new Date(),
            expiration_date || null,
            price,
          ]
        );
        selectedBatchId = batchResult.insertId;
      }
    }

    // ✅ **เพิ่มข้อมูลเข้า batch_materials**
    const [batchCheck] = await connection.query(
      "SELECT * FROM batch_materials WHERE batch_id = ? AND material_id = ?",
      [selectedBatchId, materialId]
    );

    if (batchCheck.length > 0) {
      // ✅ **ถ้ามีอยู่แล้ว อัปเดต `quantity` และ `price`**
      await connection.query(
        `UPDATE batch_materials 
         SET quantity = quantity + ?, price = (price + ?) / 2 
         WHERE batch_id = ? AND material_id = ?;`,
        [quantity, price, selectedBatchId, materialId]
      );
    } else {
      // ✅ **ถ้ายังไม่มี ให้เพิ่มรายการใหม่**
      await connection.query(
        `INSERT INTO batch_materials (batch_id, material_id, quantity, price) 
         VALUES (?, ?, ?, ?);`,
        [selectedBatchId, materialId, quantity, price]
      );
    }

    // ✅ **อัปเดต stock ของวัตถุดิบ**
    await connection.query(
      `UPDATE materials SET stock = stock + ? WHERE material_id = ?;`,
      [quantity, materialId]
    );

    await connection.commit();
    console.log(`✅ ล็อตถูกอัปเดต: batch_id = ${selectedBatchId}`);

    res.status(201).json({
      success: true,
      message: batch_id ? "อัปเดตล็อตสำเร็จ!" : "สร้างล็อตใหม่สำเร็จ!",
      batch_id: selectedBatchId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error adding material:", error);
    res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการเพิ่มวัตถุดิบ" });
  } finally {
    connection.release();
  }
});

// ✅ ลบล็อตวัตถุดิบ
router.delete("/:batch_id", async (req, res) => {
  const { batch_id } = req.params;

  try {
    // ตรวจสอบว่ามีวัตถุดิบในล็อตหรือไม่
    const [batchItems] = await db.query(
      "SELECT material_id FROM inventory_batches WHERE batch_id = ?",
      [batch_id]
    );

    if (batchItems.length === 0) {
      return res
        .status(404)
        .json({ error: "❌ ไม่พบล็อตวัตถุดิบที่ต้องการลบ" });
    }

    // ✅ ลบล็อต
    await db.query("DELETE FROM inventory_batches WHERE batch_id = ?", [
      batch_id,
    ]);

    res.json({ success: true, message: "✅ ลบล็อตวัตถุดิบสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error deleting inventory batch:", error);
    res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการลบล็อตวัตถุดิบ" });
  }
});

module.exports = router;
