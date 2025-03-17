const db = require("../config/db");

const InventoryModel = {
  // ✅ ดึงข้อมูลวัตถุดิบพร้อมค้นหา และกรองตามหมวดหมู่
  async getMaterials({ search = "%", category = "%", limit = 10, offset = 0 }) {
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
        ib.received_date, 
        ib.expiration_date, 
        u.unit_name,
        SUM(ib.quantity) AS total_quantity,
        CASE 
          WHEN SUM(ib.quantity) <= 0 THEN 'หมด'
          WHEN MIN(ib.expiration_date) <= CURDATE() THEN 'หมดอายุแล้ว'
          WHEN MIN(ib.expiration_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'ใกล้หมดอายุ'
          ELSE 'ปกติ'
        END AS status
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.category_id
      LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
      LEFT JOIN unit u ON m.unit_id = u.unit_id
      WHERE m.name LIKE ? 
        AND (m.category_id = ? OR ? = '%')
      GROUP BY m.material_id
      ORDER BY m.material_id ASC
      LIMIT ? OFFSET ?`,
      [search, category, category, limit, offset]
    );

    return { total, rows };
  },

  // ✅ ดึงข้อมูลวัตถุดิบตาม ID
  async getMaterialById(id) {
    const [rows] = await db.query(
      `SELECT * FROM materials WHERE material_id = ?`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  // ✅ เพิ่มวัตถุดิบแบบเดี่ยว
  async addMaterial({ name, category_id, quantity, received_date, expiration_date, price, unit }) {
    const [existingMaterial] = await db.query(
      `SELECT material_id FROM materials WHERE name = ? AND category_id = ?`,
      [name, category_id]
    );

    let materialId;
    if (existingMaterial.length > 0) {
      materialId = existingMaterial[0].material_id;
    } else {
      const [insertResult] = await db.query(
        `INSERT INTO materials (name, category_id, unit) VALUES (?, ?, ?)`,
        [name, category_id, unit]
      );
      materialId = insertResult.insertId;
    }

    await db.query(
      `INSERT INTO inventory_batches (material_id, quantity, received_date, expiration_date, price) 
       VALUES (?, ?, ?, ?, ?)`,
      [materialId, quantity, received_date, expiration_date, price]
    );

    return materialId;
  },

  // ✅ เพิ่มวัตถุดิบแบบล็อต
  async addBatchMaterials(batch) {
    if (!Array.isArray(batch) || batch.length === 0) {
      throw new Error("❌ ไม่มีข้อมูลใน batch");
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of batch) {
        const { name, category_id, quantity, received_date, expiration_date, price, unit } = item;

        const [existingMaterial] = await connection.query(
          `SELECT material_id FROM materials WHERE name = ? AND category_id = ?`,
          [name, category_id]
        );

        let materialId;
        if (existingMaterial.length > 0) {
          materialId = existingMaterial[0].material_id;
        } else {
          const [insertResult] = await connection.query(
            `INSERT INTO materials (name, category_id, unit) VALUES (?, ?, ?)`,
            [name, category_id, unit]
          );
          materialId = insertResult.insertId;
        }

        await connection.query(
          `INSERT INTO inventory_batches (material_id, quantity, received_date, expiration_date, price) 
           VALUES (?, ?, ?, ?, ?)`,
          [materialId, quantity, received_date, expiration_date, price]
        );
      }

      await connection.commit();
      return batch.length;
    } catch (error) {
      await connection.rollback();
      console.error("❌ Error adding batch materials:", error);
      throw new Error("❌ เพิ่มวัตถุดิบแบบล็อตไม่สำเร็จ");
    } finally {
      connection.release();
    }
  },

  // ✅ อัปเดตสต็อกเมื่อมีการใช้วัตถุดิบ
  async updateMaterialStock(material_id, quantity_used) {
    await db.query(
      `UPDATE inventory_batches 
       SET quantity = quantity - ?
       WHERE material_id = ? 
       AND quantity > 0
       ORDER BY expiration_date ASC
       LIMIT 1`,
      [quantity_used, material_id]
    );
  },

  // ✅ ลบวัตถุดิบ
  async deleteMaterial(id) {
    await db.query("DELETE FROM materials WHERE material_id = ?", [id]);
    return true;
  },
};

module.exports = InventoryModel;
