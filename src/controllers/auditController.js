const pool = require("../config/db");

exports.getAuditLogs = async (req, res) => {
  const result = await pool.query(
    `
    SELECT
      a.action,
      a.created_at,
      u.email AS user,
      d.title AS document,

      CASE
        WHEN a.action LIKE 'UPLOAD%' OR a.action LIKE 'DOWNLOAD%'
        THEN split_part(v.file_path, '/', -1)
        ELSE NULL
      END AS file_name,

      CASE
        WHEN a.action LIKE 'UPLOAD%' OR a.action LIKE 'DOWNLOAD%'
        THEN v.version_number
        ELSE NULL
      END AS version_number

    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN documents d ON a.document_id = d.id

    LEFT JOIN LATERAL (
      SELECT version_number, file_path
      FROM document_versions
      WHERE document_id = d.id
      ORDER BY version_number DESC
      LIMIT 1
    ) v ON TRUE

    ORDER BY a.created_at DESC
    LIMIT 100
    `
  );

  res.json(result.rows);
};
