const pool = require("../config/db");

exports.getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, r.role_name as role, u.is_active, u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "DB Error" });
  }
};


exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    if (id === req.user.id) return res.status(400).json({ message: "Cannot delete yourself" });

    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "User removed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user" });
  }
};