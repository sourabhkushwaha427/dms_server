const pool = require("../config/db");

const logAudit = async ({ user_id, document_id, action, req }) => {
  try {
    await pool.query(
      `
      INSERT INTO audit_logs
      (user_id, document_id, action, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        user_id,
        document_id,
        action,
        req.ip,
        req.headers["user-agent"],
      ]
    );
  } catch (err) {
    console.error("AUDIT LOG ERROR:", err.message);
  }
};

module.exports = logAudit;
