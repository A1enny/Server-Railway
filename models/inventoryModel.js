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
        COALESCE(MIN(ib.received_date), m.received_date, 'N/A') AS received_date, 
        COALESCE(
          MIN(ib.expiration_date), 
          DATE_ADD(COALESCE(MIN(ib.received_date), m.received_date), INTERVAL sl.shelf_life_days DAY), 
          'N/A'
        ) AS expiration_date, 
        u.unit_name,
        SUM(m.stock) AS total_quantity,
        CASE 
          WHEN SUM(m.stock) <= 0 THEN 'หมด'
          WHEN SUM(m.stock) <= m.min_stock THEN 'ต่ำกว่ากำหนด'
          WHEN COALESCE(MIN(ib.expiration_date), 
            DATE_ADD(COALESCE(MIN(ib.received_date), m.received_date), INTERVAL sl.shelf_life_days DAY)
          ) <= CURDATE() THEN 'หมดอายุแล้ว'
          WHEN COALESCE(MIN(ib.expiration_date), 
            DATE_ADD(COALESCE(MIN(ib.received_date), m.received_date), INTERVAL sl.shelf_life_days DAY)
          ) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'ใกล้หมดอายุ'
          ELSE 'ปกติ'
        END AS status
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.category_id
      LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
      LEFT JOIN unit u ON m.unit_id = u.unit_id
      LEFT JOIN shelf_life sl ON m.category_id = sl.category_id
      WHERE m.name LIKE ? 
        AND (m.category_id = ? OR ? = '%')
      GROUP BY m.material_id, m.name, c.category_name, u.unit_name, m.received_date, m.min_stock, sl.shelf_life_days
      ORDER BY m.material_id ASC
      LIMIT ? OFFSET ?;`,
      [search, category, category, limit, offset]
    );

    return { total, rows };
  },

  // ✅ ดึงข้อมูลวัตถุดิบตาม ID
  async getMaterialById(id) {
    const [rows] = await db.query(
      `SELECT m.*, u.unit_name FROM materials m
       LEFT JOIN unit u ON m.unit_id = u.unit_id
       WHERE m.material_id = ?`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  // ✅ ฟังก์ชันเพิ่มวัถุดิบแบบเดี่ยว
  async addMaterial({
    name,
    category_id,
    quantity,
    received_date,
    expiration_date,
    price,
    unit_id,
  }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // ✅ เพิ่มข้อมูลวัตถุดิบลงใน `materials`
      const [insertResult] = await connection.query(
        `INSERT INTO materials (name, category_id, unit_id) VALUES (?, ?, ?)`,
        [name, category_id, unit_id]
      );
      const materialId = insertResult.insertId;

      // ✅ เพิ่มข้อมูลใน `inventory_batches`
      await this.addInventoryBatch(connection, {
        material_id: materialId,
        quantity,
        received_date,
        expiration_date,
        price,
      });

      await connection.commit();
      return materialId;
    } catch (error) {
      await connection.rollback();
      console.error("❌ Error adding material:", error);
      throw new Error("❌ เพิ่มวัตถุดิบไม่สำเร็จ");
    } finally {
      connection.release();
    }
  },
  // ✅ ฟังก์ชันเพิ่มวัตถุดิบแบบล็อต
  async addBatchMaterials(batch) {
    if (!Array.isArray(batch) || batch.length === 0) {
      throw new Error("❌ ไม่มีข้อมูลใน batch");
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of batch) {
        const {
          name,
          category_id,
          quantity,
          received_date,
          expiration_date,
          price,
          unit_id,
        } = item;

        // ✅ เพิ่มข้อมูลวัตถุดิบลงใน `materials`
        const [insertResult] = await connection.query(
          `INSERT INTO materials (name, category_id, unit_id) VALUES (?, ?, ?)`,
          [name, category_id, unit_id]
        );
        const materialId = insertResult.insertId;

        // ✅ เพิ่มข้อมูลใน `inventory_batches`
        await this.addInventoryBatch(connection, {
          material_id: materialId,
          quantity,
          received_date,
          expiration_date,
          price,
        });
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

  // ✅ ฟังก์ชันแยกเพิ่ม `inventory_batches`
  async addInventoryBatch(
    connection,
    { material_id, quantity, received_date, expiration_date, price }
  ) {
    await connection.query(
      `INSERT INTO inventory_batches (material_id, quantity, received_date, expiration_date, price) 
     VALUES (?, ?, ?, ?, ?)`,
      [material_id, quantity, received_date, expiration_date, price]
    );
  },
  // ✅ ดึงข้อมูลการใช้งานวัตถุดิบ
  async getUsageStatistics() {
    try {
      const [rows] = await db.query(`
        SELECT material_id, SUM(quantity_used) as total_used
        FROM usage_logs
        GROUP BY material_id
        ORDER BY total_used DESC
      `);
      return rows;
    } catch (error) {
      console.error("❌ Error fetching usage statistics:", error);
      throw error;
    }
  },

  // ✅ ดึง unit_id จากชื่อหน่วย
  async getUnitId(unitName) {
    const [rows] = await db.query(
      "SELECT unit_id FROM unit WHERE unit_name = ?",
      [unitName]
    );
  
    if (rows.length === 0) {
      throw new Error(`❌ Unit '${unitName}' not found in database`);
    }
  
    return rows[0].unit_id;
  },
  
  // ✅ แสดงวัตถุดิบที่ใช้บ่อยที่สุด
  async getMostUsedMaterials() {
    const [rows] = await db.query(`
      SELECT m.material_id, m.name, SUM(o.quantity_used) as total_used
      FROM order_items o
      JOIN materials m ON o.material_id = m.material_id
      GROUP BY m.material_id
      ORDER BY total_used DESC
      LIMIT 10
    `);
    return rows;
  },

  // ✅ ลบวัตถุดิบ
  async deleteMaterial(id) {
    await db.query("DELETE FROM materials WHERE material_id = ?", [id]);
    return true;
  },

  // ✅ ดึงข้อมูลล็อตของวัตถุดิบ
  async getMaterialBatches(materialId) {
    const [rows] = await db.query(
      `
      SELECT batch_id, received_date, expiration_date, quantity 
      FROM inventory_batches 
      WHERE material_id = ? 
      ORDER BY received_date DESC`,
      [materialId]
    );
    return rows;
  },

  // ✅ ลบล็อตวัตถุดิบ
  async deleteBatch(batchId) {
    await db.query(`DELETE FROM inventory_batches WHERE batch_id = ?`, [
      batchId,
    ]);
  },
};

module.exports = InventoryModel;
