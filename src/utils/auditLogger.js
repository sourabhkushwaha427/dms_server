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
        user_id || null, // Agar user login nahi hai toh null jayega
        document_id,
        action,
        req.ip || req.connection.remoteAddress,
        req.headers["user-agent"],
      ]
    );
  } catch (err) {
    // Console pe error dikhayega par system crash nahi karega
    console.error("AUDIT LOG ERROR:", err.message);
  }
};

module.exports = logAudit;