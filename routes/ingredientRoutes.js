const express = require("express");
const router = express.Router();
const db = require("../config/db");

module.exports = (io) => {
  // ✅ ดึงข้อมูลวัตถุดิบ พร้อมค้นหา และกรองตามหมวดหมู่
  router.get("/", async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const search = req.query.search ? `%${req.query.search}%` : "%";
      const category = req.query.category ? req.query.category : "%";

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total 
       FROM materials 
       WHERE name LIKE ? 
       AND (category_id = ? OR ? = '%')`,
        [search, category, category]
      );

      const [rows] = await db.query(
        `SELECT 
    m.material_id, 
    m.name AS material_name, 
    c.category_name, 
    COALESCE(ib.received_date, m.received_date, 'N/A') AS received_date, 
    COALESCE(
      ib.expiration_date, 
      DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY), 
      'N/A'
    ) AS expiration_date, 
    u.unit_name,
    m.stock AS total_quantity,
    CASE 
        WHEN m.stock <= 0 THEN 'หมด'
        WHEN m.stock <= m.min_stock THEN 'ต่ำกว่ากำหนด'
        WHEN COALESCE(ib.expiration_date, 
          DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY)
        ) <= CURDATE() THEN 'หมดอายุแล้ว'
        WHEN COALESCE(ib.expiration_date, 
          DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY)
        ) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'ใกล้หมดอายุ'
        ELSE 'ปกติ'
    END AS status
FROM materials m
LEFT JOIN categories c ON m.category_id = c.category_id
LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
LEFT JOIN units u ON m.unit_id = u.unit_id
LEFT JOIN shelf_life sl ON m.category_id = sl.category_id
WHERE m.name LIKE ? 
  AND (m.category_id = ? OR ? = '%')
ORDER BY m.material_id ASC
LIMIT ? OFFSET ?
`,
        [search, category, category, limit, offset]
      );

      console.log(
        `📌 ค้นหา "${req.query.search}" หมวดหมู่ "${req.query.category}"`
      );

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
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const [rows] = await db.query(
        `SELECT 
        m.material_id, 
        m.name AS material_name, 
        c.category_name, 
        COALESCE(ib.received_date, m.received_date, 'N/A') AS received_date, 
        COALESCE(
          ib.expiration_date, 
          DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY), 
          'N/A'
        ) AS expiration_date, 
        u.unit_name,
        COALESCE(ib.quantity - ib.used_quantity, m.stock) AS total_quantity, 
        m.min_stock,
        CASE 
            WHEN COALESCE(ib.quantity - ib.used_quantity, m.stock) <= 0 THEN 'หมด'
            WHEN COALESCE(ib.quantity - ib.used_quantity, m.stock) <= m.min_stock THEN 'ต่ำกว่ากำหนด'
            WHEN COALESCE(ib.expiration_date, 
              DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY)
            ) <= CURDATE() THEN 'หมดอายุแล้ว'
            WHEN COALESCE(ib.expiration_date, 
              DATE_ADD(COALESCE(ib.received_date, m.received_date), INTERVAL sl.shelf_life_days DAY)
            ) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'ใกล้หมดอายุ'
            ELSE 'ปกติ'
        END AS status
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.category_id
      LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
      LEFT JOIN units u ON m.unit_id = u.unit_id
      LEFT JOIN shelf_life sl ON m.category_id = sl.category_id
      WHERE m.material_id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "❌ Material not found" });
      }

      res.json({ success: true, material: rows[0] });
    } catch (error) {
      console.error("❌ Error fetching material:", error);
      res.status(500).json({ error: "❌ Error fetching material" });
    }
  });

  // ✅ เพิ่มวัตถุดิบใหม่ (หรืออัปเดตล็อตวัตถุดิบ)
  router.post("/", async (req, res) => {
    try {
      let {
        name,
        category_id,
        quantity,
        received_date,
        expiration_date,
        price,
        batch_id,
      } = req.body;
      console.log("📌 ข้อมูลที่ได้รับจาก Frontend:", req.body);

      const unit_id = 1; // ✅ ใช้หน่วย "กรัม" เป็นค่าเริ่มต้น

      if (!name || !category_id) {
        return res
          .status(400)
          .json({ error: "❌ กรุณากรอกชื่อและเลือกหมวดหมู่" });
      }

      quantity = isNaN(quantity) || quantity < 0 ? 0 : quantity;
      price = isNaN(price) || price < 0 ? 0 : price;
      received_date = received_date || new Date().toISOString().split("T")[0];
      expiration_date = expiration_date || null;

      console.log("✅ Debug Material Data:", {
        name,
        category_id,
        unit_id,
        quantity,
        received_date,
        expiration_date,
        price,
        batch_id,
      });

      const connection = await db.getConnection();
      await connection.beginTransaction();

      let materialId;
      let batchId = batch_id || null;

      const [existingMaterial] = await connection.query(
        `SELECT material_id FROM materials WHERE name = ? AND category_id = ? AND unit_id = ?`,
        [name, category_id, unit_id]
      );

      if (existingMaterial.length > 0) {
        materialId = existingMaterial[0].material_id;
      } else {
        const [result] = await connection.query(
          `INSERT INTO materials (name, category_id, unit_id) VALUES (?, ?, ?)`,
          [name, category_id, unit_id]
        );
        materialId = result.insertId;
      }

      console.log("✅ materialId:", materialId);

      if (!batchId) {
        const [existingBatch] = await connection.query(
          "SELECT batch_id FROM inventory_batches WHERE material_id = ? AND received_date = ? AND expiration_date = ?",
          [materialId, received_date, expiration_date]
        );

        if (existingBatch.length > 0) {
          batchId = existingBatch[0].batch_id;
        } else {
          const [batchResult] = await connection.query(
            `INSERT INTO inventory_batches (material_id, quantity, received_date, expiration_date, price) 
           VALUES (?, ?, ?, ?, ?)`,
            [materialId, quantity, received_date, expiration_date, price]
          );
          batchId = batchResult.insertId;
        }
      } else {
        await connection.query(
          `UPDATE inventory_batches 
         SET quantity = quantity + ?, price = (price + ?) / 2 
         WHERE batch_id = ?`,
          [quantity, price, batchId]
        );
      }

      console.log("✅ batchId:", batchId);

      await connection.commit();
      res.status(201).json({
        success: true,
        message: batch_id ? "อัปเดตล็อตสำเร็จ!" : "สร้างล็อตใหม่สำเร็จ!",
        batch_id: batchId,
      });
    } catch (error) {
      console.error("❌ Error adding material:", error);
      res.status(500).json({ error: "❌ เกิดข้อผิดพลาดในการเพิ่มวัตถุดิบ" });
    }
  });

  // ✅ ลบวัตถุดิบ (ตรวจสอบว่าใช้ในสูตรอาหารหรือไม่)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "❌ Invalid material ID" });
    }

    try {
      // ตรวจสอบว่าวัตถุดิบมีอยู่ใน `inventory_batches` หรือ `recipe_ingredients`
      const [usedInRecipes] = await db.query(
        "SELECT * FROM recipe_ingredients WHERE material_id = ?",
        [id]
      );
      const [usedInInventory] = await db.query(
        "SELECT * FROM inventory_batches WHERE material_id = ?",
        [id]
      );

      if (usedInRecipes.length > 0 || usedInInventory.length > 0) {
        return res
          .status(400)
          .json({ error: "❌ ไม่สามารถลบวัตถุดิบที่ยังถูกใช้งานอยู่" });
      }

      // ✅ ลบวัตถุดิบ
      await db.query("DELETE FROM materials WHERE material_id = ?", [id]);
      res.json({ success: true, message: "✅ ลบวัตถุดิบสำเร็จ!" });
    } catch (error) {
      console.error("❌ Error deleting material:", error);
      res.status(500).json({ error: "❌ ลบวัตถุดิบไม่สำเร็จ" });
    }
  });

  return router;
};
