const express = require("express");
const router = express.Router();
const db = require("../config/db");

module.exports = (io) => {
  if (!io) {
    console.error("❌ io is undefined in tableRoutes.js");
    throw new Error("❌ io is required in tableRoutes");
  }

  // ✅ ดึงข้อมูลโต๊ะทั้งหมด
  router.get("/", async (req, res) => {
    const { search, status } = req.query;
    try {
      let query = "SELECT * FROM tables WHERE 1";
      const params = [];

      if (search) {
        query += " AND table_number LIKE ?";
        params.push(`%${search}%`);
      }

      if (status) {
        query += " AND status = ?";
        params.push(status);
      }

      const [tables] = await db.query(query, params);
      if (!tables || tables.length === 0) {
        return res.status(404).json({ error: "❌ ไม่มีข้อมูลโต๊ะในฐานข้อมูล" });
      }
      res.json(tables);
    } catch (error) {
      console.error("❌ Error fetching tables:", error);
      res.status(500).json({ error: "❌ ไม่สามารถดึงข้อมูลโต๊ะได้" });
    }
  });

  // ✅ ดึงข้อมูลโต๊ะตาม ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [table] = await db.query(
        "SELECT * FROM tables WHERE table_id = ?",
        [id]
      );
      if (!table || table.length === 0) {
        return res.status(404).json({ error: "❌ ไม่พบโต๊ะนี้" });
      }
      res.json(table[0]);
    } catch (error) {
      console.error("❌ ดึงข้อมูลโต๊ะผิดพลาด:", error);
      res.status(500).json({ error: "❌ เกิดข้อผิดพลาด" });
    }
  });

  // ✅ Route สำหรับ /api/tables/updates
  router.get("/updates", (req, res) => {
    db.query(
      "SELECT table_id, table_number, status FROM tables",
      (err, result) => {
        if (err) {
          console.error("❌ Error fetching tables status:", err);
          return res.status(500).json({ error: "❌ ไม่สามารถดึงสถานะโต๊ะได้" });
        }
        res.json(result); // ส่งข้อมูลสถานะโต๊ะกลับ
      }
    );
  });

  // ✅ เปลี่ยนสถานะโต๊ะเป็น "in-use"
  router.put("/:id/start", async (req, res) => {
    try {
      const { id } = req.params;
      const [existingTable] = await db.query(
        "SELECT * FROM tables WHERE table_id = ?",
        [id]
      );
      if (!existingTable || existingTable.length === 0) {
        return res
          .status(404)
          .json({ error: "❌ ไม่พบโต๊ะที่ต้องการอัปเดตสถานะ" });
      }
      await db.query("UPDATE tables SET status = 'in-use' WHERE table_id = ?", [
        id,
      ]);
      io.emit("tableUpdated", { table_id: id, status: "in-use" });
      res.json({ message: "✅ โต๊ะกำลังใช้งาน" });
    } catch (error) {
      console.error("❌ Error updating table status to 'in-use':", error);
      res.status(500).json({ error: "❌ ไม่สามารถอัปเดตสถานะโต๊ะได้" });
    }
  });

  // ✅ คืนสถานะโต๊ะเป็น "available"
  router.put("/:id/reset", async (req, res) => {
    try {
      const { id } = req.params;
      const [existingTable] = await db.query(
        "SELECT * FROM tables WHERE table_id = ?",
        [id]
      );
      if (!existingTable || existingTable.length === 0) {
        return res
          .status(404)
          .json({ error: "❌ ไม่พบโต๊ะที่ต้องการอัปเดตสถานะ" });
      }
      await db.query(
        "UPDATE tables SET status = 'available' WHERE table_id = ?",
        [id]
      );
      io.emit("tableUpdated", { table_id: id, status: "available" });
      res.json({ message: "✅ โต๊ะพร้อมใช้งานอีกครั้ง" });
    } catch (error) {
      console.error("❌ Error updating table status to 'available':", error);
      res.status(500).json({ error: "❌ ไม่สามารถอัปเดตสถานะโต๊ะได้" });
    }
  });

  // ✅ เพิ่มโต๊ะใหม่
  router.post("/", async (req, res) => {
    const { table_number, seats, status = "ว่าง" } = req.body; // Default status to 'available'

    if (!table_number || !seats) {
      return res
        .status(400)
        .json({ error: "❌ กรุณาระบุหมายเลขโต๊ะ และจำนวนที่นั่ง" });
    }

    try {
      const [result] = await db.query(
        "INSERT INTO tables (table_number, status, seats) VALUES (?, ?, ?)",
        [table_number, status, seats] // Insert into table_number and seats
      );
      res.status(201).json({
        message: "✅ เพิ่มโต๊ะใหม่สำเร็จ",
        table_id: result.insertId, // Use the auto-generated table_id
        table_number,
        status,
        seats,
      });
    } catch (error) {
      console.error("❌ Error creating table:", error);
      res.status(500).json({ error: "❌ ไม่สามารถเพิ่มโต๊ะได้" });
    }
  });

  // DELETE /api/tables/:id
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.query("DELETE FROM tables WHERE table_id = ?", [
        id,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "❌ โต๊ะไม่พบในฐานข้อมูล" });
      }
      res.status(200).json({ message: "✅ ลบโต๊ะสำเร็จ" });
    } catch (error) {
      console.error("❌ Error deleting table:", error);
      res.status(500).json({ error: "❌ ไม่สามารถลบโต๊ะได้" });
    }
  });

  // Update table status to 'in-use' when an order is placed
  router.put("/update-status/:tableId", async (req, res) => {
    const { tableId } = req.params;
    try {
      await db.query("UPDATE tables SET status = 'in-use' WHERE table_id = ?", [
        tableId,
      ]);
      io.emit("tableUpdated", { table_id: tableId, status: "in-use" });
      res.status(200).json({ message: "Table status updated" });
    } catch (error) {
      console.error("❌ Error updating table status:", error);
      res.status(500).json({ error: "❌ Could not update table status" });
    }
  });

  // Update table status to 'ไม่ว่าง' when an order is placed
  router.post("/placeOrder", async (req, res) => {
    const { tableId, orderDetails } = req.body;
    try {
      // Update table status to 'ไม่ว่าง' when an order is placed
      await db.query(
        "UPDATE tables SET status = 'ไม่ว่าง' WHERE table_id = ?",
        [tableId]
      );
      io.emit("tableUpdated", { table_id: tableId, status: "ไม่ว่าง" });
      res.status(200).json({
        message: "Order placed successfully and table status updated!",
      });
    } catch (error) {
      console.error("Error updating table status:", error);
      res
        .status(500)
        .json({ error: "Failed to place order and update table status." });
    }
  });

  return router;
};
