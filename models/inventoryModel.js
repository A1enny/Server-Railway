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
      LEFT JOIN unit u ON m.unit_id = u.unit_id
      LEFT JOIN shelf_life sl ON m.category_id = sl.category_id
      WHERE m.name LIKE ? 
        AND (m.category_id = ? OR ? = '%')
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

  // ✅ เพิ่มวัตถุดิบใหม่
  async addMaterial({ name, category_id, quantity, received_date, expiration_date, price }) {
    const [result] = await db.query(
      `INSERT INTO materials (name, category_id, quantity, received_date, expiration_date, price) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, category_id, quantity, received_date, expiration_date, price]
    );
    return result.insertId;
  },

  // ✅ ลบวัตถุดิบ
  async deleteMaterial(id) {
    await db.query("DELETE FROM materials WHERE material_id = ?", [id]);
    return true;
  },
};

module.exports = InventoryModel;
