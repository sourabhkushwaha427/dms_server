const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { generateToken } = require("../utils/jwt");
const crypto = require("crypto");

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT u.id, u.email, u.password_hash, r.role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1 AND u.is_active = true
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken({
      id: user.id,
      role: user.role_name,
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role_name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.me = async (req, res) => {
  res.json({
    user: req.user,
  });
};


exports.signup = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  try {
    const roleRes = await pool.query(
      "SELECT id FROM roles WHERE role_name = 'Public'"
    );

    const hashedPassword = await bcrypt.hash(password, 10);

    const userRes = await pool.query(
      `
      INSERT INTO users (username, email, password_hash, role_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email
      `,
      [username, email, hashedPassword, roleRes.rows[0].id]
    );

    res.status(201).json({
      message: "Signup successful",
      user: userRes.rows[0],
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};




exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await pool.query(
    `
    UPDATE users
    SET reset_token = $1, reset_token_expiry = $2
    WHERE email = $3
    `,
    [token, expiry, email]
  );

  // 📩 Email integration later
  res.json({
    message: "Password reset link generated",
    resetToken: token, // demo only
  });
};


exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  const hashed = await bcrypt.hash(newPassword, 10);

  const result = await pool.query(
    `
    UPDATE users
    SET password_hash = $1,
        reset_token = NULL,
        reset_token_expiry = NULL
    WHERE reset_token = $2
      AND reset_token_expiry > NOW()
    RETURNING id
    `,
    [hashed, token]
  );

  if (result.rowCount === 0) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  res.json({ message: "Password reset successful" });
};
