const express = require("express");
const router = express.Router();
const db = require("../config/db.js");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ✅ ตรวจสอบและสร้างโฟลเดอร์อัปโหลด
const uploadDir = path.join(__dirname, "../uploads/recipes");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ ตั้งค่า Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, "recipe_" + Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// ✅ **เพิ่มสูตรอาหาร**
router.post("/", upload.single("image"), async (req, res) => {
  try {
    console.log("📌 Data received:", req.body);
    console.log("📌 Uploaded file:", req.file);

    let { recipe_name, category_id, ingredients } = req.body;

    if (!recipe_name || !category_id) {
      return res.status(400).json({ success: false, message: "กรุณากรอกชื่อสูตรอาหารและเลือกหมวดหมู่" });
    }

    let imagePath = req.file ? `/uploads/recipes/${req.file.filename}` : "/uploads/recipes/default.jpg";

    // ✅ เพิ่มสูตรอาหารลงในฐานข้อมูล
    const [result] = await db.query(
      "INSERT INTO recipes (recipe_name, category_id, image) VALUES (?, ?, ?)",
      [recipe_name, category_id, imagePath]
    );

    const recipeId = result.insertId;
    console.log("✅ Recipe added with ID:", recipeId);

    // ✅ ตรวจสอบและเพิ่มวัตถุดิบ
    if (ingredients) {
      try {
        const parsedIngredients = JSON.parse(ingredients);
        if (!Array.isArray(parsedIngredients)) throw new Error("Invalid ingredients format");

        for (const ingredient of parsedIngredients) {
          if (!ingredient.material_id || !ingredient.quantity) {
            console.warn("⚠️ ข้อมูลวัตถุดิบไม่ครบถ้วน:", ingredient);
            continue;
          }

          // ✅ เพิ่มวัตถุดิบลงในตาราง recipe_ingredients
          await db.query(
            "INSERT INTO recipe_ingredients (recipe_id, material_id, amount) VALUES (?, ?, ?)",
            [recipeId, ingredient.material_id, ingredient.quantity]
          );
          console.log(`✅ Added ingredient: ${ingredient.material_id} (Quantity: ${ingredient.quantity})`);
        }

        console.log("✅ Ingredients added successfully.");
      } catch (parseError) {
        console.error("❌ Error parsing ingredients:", parseError);
        return res.status(400).json({ success: false, message: "รูปแบบวัตถุดิบไม่ถูกต้อง" });
      }
    } else {
      console.warn("⚠️ ไม่มีวัตถุดิบถูกส่งมา");
    }

    res.status(201).json({ success: true, message: "เพิ่มสูตรอาหารสำเร็จ!", recipe_id: recipeId });
  } catch (error) {
    console.error("❌ Error adding recipe:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเพิ่มสูตรอาหาร" });
  }
});

// ✅ **ลบสูตรอาหาร**
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id); // 🔧 แปลง ID เป็นตัวเลข
  console.log("🔍 กำลังลบสูตรอาหาร ID:", id);

  try {
    const [recipe] = await db.query("SELECT * FROM recipes WHERE recipe_id = ?", [id]);
    if (!recipe.length) {
      return res.status(404).json({ message: "❌ ไม่พบสูตรอาหาร" });
    }

    await db.query("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [id]);
    await db.query("DELETE FROM recipes WHERE recipe_id = ?", [id]);

    res.json({ message: "✅ ลบสูตรอาหารสำเร็จ" });
  } catch (error) {
    console.error("❌ Error deleting recipe:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// ✅ **อัปเดตสูตรอาหาร**
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { recipe_name, category_id, ingredients } = req.body;
  let imagePath = req.file ? `/uploads/recipes/${req.file.filename}` : null;

  try {
    const [oldRecipe] = await db.query("SELECT image FROM recipes WHERE recipe_id = ?", [id]);
    if (!imagePath && oldRecipe.length > 0) {
      imagePath = oldRecipe[0].image;
    }

    await db.query(
      "UPDATE recipes SET recipe_name = ?, category_id = ?, image = ? WHERE recipe_id = ?",
      [recipe_name, category_id, imagePath, id]
    );

    await db.query("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [id]);

    let ingredientList;
    try {
      ingredientList = JSON.parse(ingredients);
      if (!Array.isArray(ingredientList)) throw new Error("Invalid ingredients format");
    } catch (error) {
      console.error("❌ Error parsing ingredients:", error);
      return res.status(400).json({ success: false, message: "รูปแบบ ingredients ไม่ถูกต้อง" });
    }

    for (const ing of ingredientList) {
      await db.query(
        "INSERT INTO recipe_ingredients (recipe_id, material_id, amount) VALUES (?, ?, ?)",
        [id, ing.material_id, ing.quantity]
      );      
    }

    res.json({ success: true, message: "อัปเดตสูตรอาหารสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error updating recipe:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตสูตรอาหาร" });
  }
});

// ✅ **ดึงข้อมูลสูตรอาหารทั้งหมดพร้อมข้อมูลจากตารางเมนูและหมวดหมู่**
router.get("/", async (req, res) => {
  try {
    // ดึงข้อมูลสูตรอาหาร พร้อมกับข้อมูลเมนูและหมวดหมู่
    const query = `
      SELECT 
        r.recipe_id, 
        r.recipe_name, 
        r.image AS recipe_image, 
        m.menu_image, 
        m.price, 
        c.category_name AS menu_category
      FROM recipes r
      LEFT JOIN menus m ON r.recipe_id = m.recipe_id
      LEFT JOIN menu_categories c ON m.menu_category_id = c.menu_category_id;
    `;
    
    const [recipes] = await db.query(query);
    res.json(recipes); // ส่งข้อมูลสูตรอาหารทั้งหมด
  } catch (error) {
    console.error("❌ Error fetching recipes:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการโหลดสูตรอาหาร" });
  }
});


// ✅ **ดึงข้อมูลสูตรอาหารแบบละเอียด**
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [recipe] = await db.query(
      `SELECT r.recipe_id, r.recipe_name, r.image, r.category_id, c.category_name
       FROM recipes r
       LEFT JOIN categories c ON r.category_id = c.category_id
       WHERE r.recipe_id = ?`, 
      [id]
    );

    if (recipe.length === 0) {
      return res.status(404).json({ message: "ไม่พบสูตรอาหารนี้" });
    }

    const [ingredients] = await db.query(
      `SELECT ri.material_id, 
              m.name AS material_name, 
              c.category_name, 
              ri.amount, 
              u.unit_name
       FROM recipe_ingredients ri
       LEFT JOIN materials m ON ri.material_id = m.material_id  
       LEFT JOIN categories c ON m.category_id = c.category_id
       LEFT JOIN units u ON m.unit_id = u.unit_id  -- 🔄 เปลี่ยนจาก units เป็น unit
       WHERE ri.recipe_id = ?`, 
      [id]
    );    

    res.json({
      ...recipe[0],
      ingredients: ingredients || [],
    });

  } catch (error) {
    console.error("❌ Error fetching recipe details:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการโหลดสูตรอาหาร" });
  }
});

module.exports = router;