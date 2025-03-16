const express = require("express");
const router = express.Router();
const db = require("../config/db.js");

// ✅ API ดึงข้อมูลเมนูทั้งหมด พร้อมหมวดหมู่และรูปภาพ
router.get("/", async (req, res) => {
  try {
    const [menus] = await db.query(
      `SELECT 
                m.menu_id AS id, 
                r.recipe_name AS name, 
                r.recipe_id,  
                CAST(m.price AS DECIMAL(10,2)) + 0 AS price, 
                CONCAT(?, r.image) AS image,
                mc.menu_category_id,  
                mc.category_name 
            FROM menus m
            LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
            LEFT JOIN menu_categories mc ON m.menu_category_id = mc.menu_category_id
            ORDER BY m.menu_id ASC`,
      ["https://mawmong.shop:8080"] // ✅ กำหนด BASE_URL ตรงนี้
    );

    res.json({ success: true, results: menus });
  } catch (error) {
    console.error("❌ Error fetching menu:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงเมนู" });
  }
});

// 📌 6. ดึงสินค้าขายดี (Top Selling Products)
router.get("/top", async (req, res) => {
  try {
    const topProductsQuery = `
 SELECT 
    r.recipe_name AS name,
    SUM(oi.quantity) AS quantity_sold,
    SUM(m.price * oi.quantity) AS total_sales
FROM order_items oi
LEFT JOIN menus m ON oi.menu_id = m.menu_id
LEFT JOIN recipes r ON m.recipe_id = r.recipe_id
GROUP BY r.recipe_name
ORDER BY total_sales DESC
LIMIT 5;
    `;

    const [topProducts] = await db.query(topProductsQuery);
    res.json(topProducts);
  } catch (error) {
    console.error("❌ Error fetching top products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ API ดึงข้อมูลหมวดหมู่
router.get("/category", async (req, res) => {
  try {
    const [categories] = await db.query(
      "SELECT * FROM menu_categories ORDER BY category_name ASC"
    );
    res.json({ success: true, results: categories });
  } catch (error) {
    console.error("❌ Error fetching menu categories:", error);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลหมวดหมู่อาหารได้" });
  }
});

router.post("/", async (req, res) => {
  const { recipe_id, menu_category_id, price } = req.body;

  if (!recipe_id || !menu_category_id || !price) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    // ตรวจสอบว่ามี recipe_id อยู่จริง
    const [recipe] = await db.query(
      "SELECT * FROM recipes WHERE recipe_id = ?",
      [recipe_id]
    );
    if (recipe.length === 0) {
      return res.status(400).json({ error: "❌ recipe_id ไม่ถูกต้อง" });
    }

    // ตรวจสอบว่ามี menu_category_id อยู่จริง
    const [category] = await db.query(
      "SELECT * FROM menu_categories WHERE menu_category_id = ?",
      [menu_category_id]
    );
    if (category.length === 0) {
      return res.status(400).json({ error: "❌ menu_category_id ไม่ถูกต้อง" });
    }

    // เพิ่มเมนูใหม่
    const [result] = await db.query(
      "INSERT INTO menus (recipe_id, menu_category_id, price) VALUES (?, ?, ?)",
      [recipe_id, menu_category_id, price]
    );
    res
      .status(201)
      .json({ message: "✅ เพิ่มเมนูสำเร็จ", menu_id: result.insertId });
  } catch (error) {
    console.error("❌ Error adding menu:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเพิ่มเมนู" });
  }
});

// ✅ API ลบเมนู
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM menus WHERE menu_id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "ไม่พบเมนูที่ต้องการลบ" });
    }

    res.json({ success: true, message: "ลบเมนูสำเร็จ" });
  } catch (error) {
    console.error("❌ Error deleting menu:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบเมนู" });
  }
});

// 📌 อัปเดตข้อมูลเมนูตาม `menu_id`
router.put("/:id", async (req, res) => {
  const { recipe_id, menu_category_id, price } = req.body;

  // ✅ เช็กว่ามีค่าถูกส่งมาหรือไม่
  if (
    recipe_id === undefined &&
    menu_category_id === undefined &&
    price === undefined
  ) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลที่ต้องการแก้ไข" });
  }

  let updateFields = [];
  let values = [];

  if (recipe_id !== undefined) {
    updateFields.push("recipe_id = ?");
    values.push(recipe_id);
  }
  if (menu_category_id !== undefined) {
    updateFields.push("menu_category_id = ?");
    values.push(menu_category_id);
  }
  if (price !== undefined) {
    updateFields.push("price = ?");
    values.push(price);
  }

  values.push(req.params.id); // เพิ่ม menu_id ใน WHERE clause

  const updateQuery = `
      UPDATE menus 
      SET ${updateFields.join(", ")}
      WHERE menu_id = ?
    `;

  try {
    const [result] = await db.query(updateQuery, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "ไม่พบเมนูที่ต้องการแก้ไข" });
    }

    res.json({ success: true, message: "แก้ไขเมนูสำเร็จ" });
  } catch (error) {
    console.error("❌ Error updating menu:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
  }
});

router.get("/check-stock/:recipeId", async (req, res) => {
  const { recipeId } = req.params;

  try {
    const [ingredients] = await db.query(
      `SELECT ri.material_id, ri.amount, COALESCE(mat.stock, 0) AS stock
       FROM recipe_ingredients ri
       JOIN materials mat ON ri.material_id = mat.material_id
       WHERE ri.recipe_id = ?`,
      [recipeId]
    );

    if (ingredients.length === 0) {
      return res.json({ success: true, maxDishes: 0, isOutOfStock: true });
    }

    let minDishes = Infinity;
    let isOutOfStock = false;

    ingredients.forEach(({ stock, amount }) => {
      if (amount > 0) {
        const possibleDishes = Math.floor(stock / amount);
        if (possibleDishes < minDishes) {
          minDishes = possibleDishes;
        }
      }
      if (stock <= 0) isOutOfStock = true; // ถ้าสต็อกเป็น 0 ให้ถือว่าสินค้าหมด
    });

    res.json({
      success: true,
      maxDishes: isFinite(minDishes) ? minDishes : 0,
      isOutOfStock,
    });
  } catch (error) {
    console.error("❌ Error checking stock:", error);
    res.status(500).json({ error: "Stock check failed" });
  }
});

module.exports = router;
