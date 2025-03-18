const db = require("../config/db");

const InventoryModel = {
  // ✅ ดึงข้อมูลวัตถุดิบพร้อมค้นหา และกรองตามหมวดหมู่
  async getMaterials({
    search = "%",
    category = null,
    limit = 10,
    offset = 0,
  }) {
    try {
      console.log("🔍 Fetching materials with batches...");

      const searchValue = `%${search}%`;

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM materials WHERE name LIKE ? AND (? IS NULL OR category_id = ?)`,
        [searchValue, category, category]
      );

      const [rows] = await db.query(
        `SELECT 
          m.material_id, 
          m.name AS material_name, 
          c.category_name, 
          u.unit_name,
          COALESCE(SUM(ib.quantity), 0) AS total_quantity,
          CASE 
              WHEN SUM(ib.quantity) <= 0 THEN 'หมด'
              WHEN SUM(ib.quantity) <= m.min_stock THEN 'ต่ำกว่ากำหนด'
              WHEN MIN(ib.expiration_date) <= CURDATE() THEN 'หมดอายุแล้ว'
              WHEN MIN(ib.expiration_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'ใกล้หมดอายุ'
              ELSE 'ปกติ'
          END AS status,
          IFNULL(
              JSON_ARRAYAGG(
                  JSON_OBJECT(
                      'batch_id', ib.batch_id,
                      'batch_number', ib.batch_number,
                      'received_date', ib.received_date,
                      'expiration_date', ib.expiration_date,
                      'quantity', ib.quantity,
                      'price', ib.price
                  )
              ), 
              '[]'
          ) AS batches
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.category_id
        LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
        LEFT JOIN unit u ON m.unit_id = u.unit_id
        WHERE m.name LIKE ? 
        AND (? IS NULL OR m.category_id = ?)
        GROUP BY m.material_id, m.name, c.category_name, u.unit_name, m.min_stock
        ORDER BY m.material_id ASC
        LIMIT ? OFFSET ?;`,
        [searchValue, category, category, limit, offset]
      );

      // ✅ ตรวจสอบ JSON ก่อน parse
      rows.forEach((row) => {
        try {
          if (
            typeof row.batches === "string" &&
            row.batches.trim().startsWith("[") &&
            row.batches.trim().endsWith("]")
          ) {
            row.batches = JSON.parse(row.batches);
          } else {
            row.batches = [];
          }
        } catch (error) {
          console.error("❌ JSON parse error for batches:", row.batches);
          row.batches = [];
        }
      });

      console.log("✅ Materials with batches retrieved successfully");
      return { total, rows };
    } catch (error) {
      console.error("❌ Error fetching materials with batches:", error);
      throw new Error("❌ ไม่สามารถดึงข้อมูลวัตถุดิบพร้อมล็อตได้");
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

  // ✅ เพิ่มวัตถุดิบใหม่ (แบบเดี่ยว)
  async addMaterial({
    name,
    category_id,
    quantity,
    received_date,
    expiration_date,
    price,
    unit_id,
  }) {
    console.log("✅ Adding material with unit_id:", unit_id);

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

      // ✅ เพิ่มล็อตแรกใน `inventory_batches`
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

  // ✅ เพิ่มล็อตของวัตถุดิบ (batch)
  async addBatch(batchData) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const batchNumber = `BATCH-${Date.now()}`;

      for (const item of batchData) {
        let {
          name,
          category_id,
          quantity,
          received_date,
          expiration_date,
          price,
          unit_id,
        } = item;

        quantity = Number(quantity);
        price = Number(price);
        if (isNaN(quantity) || isNaN(price)) {
          throw new Error("❌ Quantity และ Price ต้องเป็นตัวเลขที่ถูกต้อง");
        }

        received_date = received_date || new Date().toISOString().split("T")[0];

        const [existingMaterial] = await connection.query(
          `SELECT material_id FROM materials WHERE name = ? AND category_id = ? AND unit_id = ?`,
          [name, category_id, unit_id]
        );

        let materialId =
          existingMaterial.length > 0 ? existingMaterial[0].material_id : null;

        if (!materialId) {
          const [insertResult] = await connection.query(
            `INSERT INTO materials (name, category_id, unit_id) VALUES (?, ?, ?)`,

            [name, category_id, unit_id]
          );
          materialId = insertResult.insertId;
        }

        if (!expiration_date) {
          const [shelfLifeRow] = await connection.query(
            `SELECT shelf_life_days FROM shelf_life WHERE category_id = ?`,
            [category_id]
          );
          if (shelfLifeRow.length > 0) {
            expiration_date = new Date(received_date);
            expiration_date.setDate(
              expiration_date.getDate() + shelfLifeRow[0].shelf_life_days
            );
            expiration_date = expiration_date.toISOString().split("T")[0];
          } else {
            expiration_date = null;
          }
        }

        await connection.query(
          `INSERT INTO inventory_batches (material_id, batch_number, quantity, received_date, expiration_date, price) 
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            materialId,
            batchNumber,
            quantity,
            received_date,
            expiration_date,
            price,
          ]
        );
      }

      await connection.commit();
      console.log("✅ Batch added successfully:", batchNumber);
      return batchNumber;
    } catch (error) {
      await connection.rollback();
      console.error("❌ Error adding batch:", error);
      throw new Error("❌ เพิ่มล็อตวัตถุดิบไม่สำเร็จ");
    } finally {
      connection.release();
    }
  },

  // ✅ ดึง unit_id จากชื่อหน่วย
  async getUnitId(unitName) {
    try {
      console.log(`🔍 Searching for unit_id of '${unitName}'...`);
      const [rows] = await db.query(
        "SELECT unit_id FROM unit WHERE unit_name = ?",
        [unitName]
      );

      if (rows.length === 0) {
        throw new Error(`❌ ไม่พบหน่วย '${unitName}' ในฐานข้อมูล`);
      }

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
  async getMaterials({ search = "%", category = "%", limit = 10, offset = 0 }) {
    try {
      console.log("🔍 Fetching materials with batches...");

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM materials WHERE name LIKE ? AND (category_id = ? OR ? = '%')`,
        [search, category, category]
      );

      const [rows] = await db.query(
        `SELECT 
            m.material_id, 
            m.name AS material_name, 
            c.category_name, 
            u.unit_name,
            COALESCE(SUM(ib.quantity), 0) AS total_quantity,
            CASE 
                WHEN SUM(ib.quantity) <= 0 THEN 'หมด'
                WHEN SUM(ib.quantity) <= m.min_stock THEN 'ต่ำกว่ากำหนด'
                WHEN MIN(ib.expiration_date) <= CURDATE() THEN 'หมดอายุแล้ว'
                WHEN MIN(ib.expiration_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'ใกล้หมดอายุ'
                ELSE 'ปกติ'
            END AS status,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'batch_id', ib.batch_id,
                    'batch_number', ib.batch_number,
                    'received_date', ib.received_date,
                    'expiration_date', ib.expiration_date,
                    'quantity', ib.quantity,
                    'price', ib.price
                )
            ) AS batches
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.category_id
        LEFT JOIN inventory_batches ib ON m.material_id = ib.material_id
        LEFT JOIN unit u ON m.unit_id = u.unit_id
        WHERE m.name LIKE ? AND (m.category_id = ? OR ? = '%')
        GROUP BY m.material_id, m.name, c.category_name, u.unit_name, m.min_stock
        ORDER BY m.material_id ASC
        LIMIT ? OFFSET ?;`,
        [search, category, category, limit, offset]
      );

      // ✅ แปลง JSON ที่ดึงมาจาก MySQL ให้เป็น JavaScript Object
      rows.forEach((row) => {
        row.batches = JSON.parse(row.batches || "[]");
      });

      console.log("✅ Materials with batches retrieved successfully");
      return { total, rows };
    } catch (error) {
      console.error("❌ Error fetching materials with batches:", error);
      throw new Error("❌ ไม่สามารถดึงข้อมูลวัตถุดิบพร้อมล็อตได้");
    }
  },
};

module.exports = InventoryModel;
