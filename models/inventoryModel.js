const db = require("../config/db");

const InventoryModel = {
  // ✅ ดึงข้อมูลวัตถุดิบพร้อมค้นหา และกรองตามหมวดหมู่
  async getMaterials({ search = "%", category = "%", limit = 10, offset = 0 }) {
    try {
      console.log("🔍 Fetching materials with search:", search, "category:", category);

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

      console.log("✅ Materials retrieved successfully");
      return { total, rows };
    } catch (error) {
      console.error("❌ Error fetching materials:", error);
      throw new Error("❌ ไม่สามารถดึงข้อมูลวัตถุดิบได้");
    }
  },

  // ✅ ดึงข้อมูลวัตถุดิบตาม ID
  async getMaterialById(id) {
    try {
      console.log("🔍 Fetching material by ID:", id);
      const [rows] = await db.query(
        `SELECT m.*, u.unit_name FROM materials m
         LEFT JOIN unit u ON m.unit_id = u.unit_id
         WHERE m.material_id = ?`,
        [id]
      );

      if (rows.length === 0) {
        console.warn(`⚠️ Material ID ${id} not found`);
        return null;
      }

      console.log("✅ Material retrieved:", rows[0]);
      return rows[0];
    } catch (error) {
      console.error("❌ Error fetching material by ID:", error);
      throw new Error("❌ ไม่สามารถดึงข้อมูลวัตถุดิบได้");
    }
  },

  // ✅ เพิ่มวัตถุดิบใหม่
  async addMaterial({ name, category_id, quantity, received_date, expiration_date, price, unit_id }) {
    console.log("✅ Received unit_id:", unit_id);

    if (!unit_id) {
      throw new Error("❌ unit_id ไม่ถูกต้อง หรือไม่ได้รับค่า");
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // ✅ เพิ่มข้อมูลวัตถุดิบลงใน `materials`
      const [insertResult] = await connection.query(
        `INSERT INTO materials (name, category_id, unit_id) VALUES (?, ?, ?)`,
        [name, category_id, unit_id]
      );
      const materialId = insertResult.insertId;

      // ✅ เพิ่มข้อมูลลงใน `inventory_batches`
      await this.addInventoryBatch(connection, {
        material_id: materialId,
        quantity,
        received_date,
        expiration_date,
        price,
      });

      await connection.commit();
      console.log("✅ Material added successfully:", materialId);
      return materialId;
    } catch (error) {
      await connection.rollback();
      console.error("❌ Error adding material:", error);
      throw new Error("❌ เพิ่มวัตถุดิบไม่สำเร็จ");
    } finally {
      connection.release();
    }
  },

  // ✅ เพิ่มล็อตของวัตถุดิบ
  async addInventoryBatch(connection, { material_id, quantity, received_date, expiration_date, price }) {
    try {
      console.log("📝 Adding to inventory_batches:", {
        material_id,
        quantity,
        received_date,
        expiration_date,
        price,
      });

      await connection.query(
        `INSERT INTO inventory_batches (material_id, quantity, received_date, expiration_date, price) 
         VALUES (?, ?, ?, ?, ?)`,
        [material_id, quantity, received_date, expiration_date, price]
      );

      console.log("✅ Inventory batch added successfully");
    } catch (error) {
      console.error("❌ Error adding inventory batch:", error);
      throw new Error("❌ ไม่สามารถเพิ่มข้อมูลลงใน inventory_batches ได้");
    }
  },

  // ✅ ดึง unit_id จากชื่อหน่วย
  async getUnitId(unitName) {
    try {
      console.log(`🔍 Searching for unit_id of '${unitName}'...`);

      const [rows] = await db.query("SELECT unit_id FROM unit WHERE unit_name = ?", [unitName]);

      if (rows.length === 0) {
        console.error(`❌ Unit '${unitName}' not found in database`);
        throw new Error(`❌ ไม่พบหน่วย '${unitName}' ในฐานข้อมูล`);
      }

      console.log(`✅ Found unit_id: ${rows[0].unit_id} for unit '${unitName}'`);
      return rows[0].unit_id;
    } catch (error) {
      console.error("❌ Error fetching unit_id:", error);
      throw new Error("❌ ไม่สามารถดึงข้อมูล unit_id ได้");
    }
  },

  // ✅ ลบวัตถุดิบ
  async deleteMaterial(id) {
    try {
      console.log(`🗑️ Deleting material ID: ${id}`);
      await db.query("DELETE FROM materials WHERE material_id = ?", [id]);
      console.log("✅ Material deleted successfully");
      return true;
    } catch (error) {
      console.error("❌ Error deleting material:", error);
      throw new Error("❌ ไม่สามารถลบวัตถุดิบได้");
    }
  },

  // ✅ ดึงข้อมูลล็อตของวัตถุดิบ
  async getMaterialBatches(materialId) {
    try {
      console.log(`🔍 Fetching batches for material ID: ${materialId}`);
      const [rows] = await db.query(
        `SELECT batch_id, received_date, expiration_date, quantity 
         FROM inventory_batches 
         WHERE material_id = ? 
         ORDER BY received_date DESC`,
        [materialId]
      );

      console.log("✅ Retrieved material batches:", rows);
      return rows;
    } catch (error) {
      console.error("❌ Error fetching material batches:", error);
      throw new Error("❌ ไม่สามารถดึงข้อมูลล็อตของวัตถุดิบได้");
    }
  },

  // ✅ ลบล็อตวัตถุดิบ
  async deleteBatch(batchId) {
    try {
      console.log(`🗑️ Deleting batch ID: ${batchId}`);
      await db.query("DELETE FROM inventory_batches WHERE batch_id = ?", [batchId]);
      console.log("✅ Batch deleted successfully");
    } catch (error) {
      console.error("❌ Error deleting batch:", error);
      throw new Error("❌ ไม่สามารถลบล็อตของวัตถุดิบได้");
    }
  },
};

module.exports = InventoryModel;
