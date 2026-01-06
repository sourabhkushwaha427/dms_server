// src/controllers/pageController.js
const pool = require("../config/db");

// 1. Save Page (Create or Update)
exports.savePage = async (req, res) => {
  const { title, slug, content } = req.body;

  try {
    // Check if page exists, then update; else insert
    // (Simplification: Here we are doing Upsert logic)
    const check = await pool.query("SELECT * FROM pages WHERE slug = $1", [slug]);

    if (check.rows.length > 0) {
      // Update
      const update = await pool.query(
        "UPDATE pages SET title = $1, content = $2 WHERE slug = $3 RETURNING *",
        [title, content, slug]
      );
      return res.json(update.rows[0]);
    } else {
      // Insert
      const insert = await pool.query(
        "INSERT INTO pages (title, slug, content) VALUES ($1, $2, $3) RETURNING *",
        [title, slug, content]
      );
      return res.json(insert.rows[0]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving page" });
  }
};

// 2. Get Page by Slug (Public View ke liye)
exports.getPage = async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query("SELECT * FROM pages WHERE slug = $1", [slug]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Page not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};

// 3. Get All Pages (Navbar ke liye)
exports.getAllPages = async (req, res) => {
  try {
    const result = await pool.query("SELECT id, title, slug FROM pages");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};