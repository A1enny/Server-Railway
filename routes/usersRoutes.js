const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../config/db.js");
require("dotenv").config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

// 📌 Middleware ตรวจสอบ JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    return res.status(401).json({ message: "❌ Unauthorized, Token is required" });
  }

  const token = authHeader.replace("Bearer ", "");
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "❌ Invalid or Expired Token" });
    }
    req.user = user;
    next();
  });
};

// 📌 ✅ ดึงข้อมูลผู้ใช้ทั้งหมด (ต้องใช้ Token)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [users] = await db.query("SELECT user_id, username, user_role FROM users");
    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: "❌ Error fetching users" });
  }
});

// 📌 ✅ ดึงข้อมูลผู้ใช้ตาม ID (ต้องใช้ Token)
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [user] = await db.query("SELECT user_id, username, user_role FROM users WHERE user_id = ?", [id]);
    if (user.length === 0) {
      return res.status(404).json({ message: "❌ ไม่พบผู้ใช้" });
    }
    res.json(user[0]);
  } catch (error) {
    res.status(500).json({ message: "❌ Error fetching user" });
  }
});

// 📌 ✅ ลบผู้ใช้ (ต้องใช้ Token)
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM users WHERE user_id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "❌ ไม่พบผู้ใช้" });
    }
    res.json({ message: "✅ ลบผู้ใช้สำเร็จ" });
  } catch (error) {
    res.status(500).json({ message: "❌ ไม่สามารถลบผู้ใช้ได้" });
  }
});

// 📌 ✅ เพิ่มผู้ใช้ใหม่ (บันทึกรหัสผ่านแบบ plaintext)
router.post("/", async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ message: "❌ กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    const [existingUsers] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (existingUsers.length) {
      return res.status(409).json({ message: "❌ ชื่อผู้ใช้มีอยู่แล้ว" });
    }

    await db.query("INSERT INTO users (username, password, user_role) VALUES (?, ?, ?)", [
      username,
      password, // ❗ บันทึกเป็น plaintext (ไม่มีการเข้ารหัส)
      role,
    ]);

    res.status(201).json({ message: "✅ เพิ่มผู้ใช้สำเร็จ" });
  } catch (error) {
    res.status(500).json({ message: "❌ ไม่สามารถเพิ่มผู้ใช้ได้" });
  }
});

// 📌 ✅ อัปเดตรหัสผ่าน (ต้องใช้ Token)
router.put("/password/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;

  try {
    const [users] = await db.query("SELECT password FROM users WHERE user_id = ?", [id]);
    if (!users.length) {
      return res.status(404).json({ message: "❌ ไม่พบผู้ใช้" });
    }

    // ✅ ตรวจสอบรหัสผ่านแบบตรงๆ
    if (currentPassword !== users[0].password) {
      return res.status(400).json({ message: "❌ รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    }

    await db.query("UPDATE users SET password = ? WHERE user_id = ?", [newPassword, id]);
    res.json({ message: "✅ เปลี่ยนรหัสผ่านเรียบร้อย!" });
  } catch (error) {
    res.status(500).json({ message: "❌ เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน" });
  }
});

// 📌 ✅ อัปเดตข้อมูลผู้ใช้ (ต้องใช้ Token)
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, role } = req.body;

  try {
    const [result] = await db.query(
      "UPDATE users SET username = ?, user_role = ? WHERE user_id = ?",
      [username, role, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "❌ ไม่พบผู้ใช้" });
    }

    res.json({ message: "✅ อัปเดตข้อมูลสำเร็จ!" });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ message: "❌ ไม่สามารถอัปเดตข้อมูลได้" });
  }
});

// 📌 ✅ เข้าสู่ระบบ (คืนค่า JWT Token)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "❌ กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });
  }

  try {
    const [users] = await db.query("SELECT user_id, username, user_role, password FROM users WHERE username = ?", [username]);

    if (users.length === 0) {
      return res.status(401).json({ message: "❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const user = users[0];

    // ✅ ตรวจสอบรหัสผ่านแบบตรงๆ
    if (password !== user.password) {
      return res.status(401).json({ message: "❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    // 🔥 สร้าง JWT Token
    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, role: user.user_role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "✅ เข้าสู่ระบบสำเร็จ",
      token,
      user_id: user.user_id,
      username: user.username,
      role: user.user_role,
    });
  } catch (error) {
    res.status(500).json({ message: "❌ เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

module.exports = router;
