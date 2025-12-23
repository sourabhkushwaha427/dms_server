const pool = require("../config/db");

/**
 * GET all categories (flat list)
 * (Frontend can convert to tree)
 */
exports.getCategories = async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, parent_id, created_at
     FROM categories
     ORDER BY created_at ASC`
  );

  res.json(result.rows);
};

/**
 * CREATE category
 */
exports.createCategory = async (req, res) => {
  const { name, parent_id = null } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Category name required" });
  }

  const result = await pool.query(
    `
    INSERT INTO categories (name, parent_id)
    VALUES ($1, $2)
    RETURNING *
    `,
    [name, parent_id]
  );

  res.status(201).json(result.rows[0]);
};

/**
 * UPDATE category
 */
exports.updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, parent_id } = req.body;

  const result = await pool.query(
    `
    UPDATE categories
    SET name = $1, parent_id = $2
    WHERE id = $3
    RETURNING *
    `,
    [name, parent_id || null, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "Category not found" });
  }

  res.json(result.rows[0]);
};

/**
 * DELETE category
 */
exports.deleteCategory = async (req, res) => {
  const { id } = req.params;

  await pool.query(
    `DELETE FROM categories WHERE id = $1`,
    [id]
  );

  res.json({ message: "Category deleted" });
};
