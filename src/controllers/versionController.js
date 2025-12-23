const pool = require("../config/db");
const path = require("path");
const logAudit = require("../utils/auditLogger");

/**
 * UPLOAD new document version
 * Allowed: Staff, Admin
 */
exports.uploadVersion = async (req, res) => {
  const documentId = req.params.id;

  if (req.user.role === "Public") {
    return res.status(403).json({ message: "Upload not allowed" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "File required" });
  }

  try {
    // 🔍 Check document + visibility
    const docRes = await pool.query(
      `
      SELECT current_version_num, visibility
      FROM documents
      WHERE id = $1
      `,
      [documentId]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (req.user.role === "Staff" && docRes.rows[0].visibility === "admin") {
      return res.status(403).json({ message: "Upload not allowed" });
    }

    const nextVersion = docRes.rows[0].current_version_num + 1;

    const result = await pool.query(
      `
      INSERT INTO document_versions
      (document_id, version_number, file_path, file_type, file_size_bytes, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        documentId,
        nextVersion,
        req.file.path,
        path.extname(req.file.originalname),
        req.file.size,
        req.user.id,
      ]
    );

    // ✅ AUDIT UPLOAD (WITH VERSION)
    await logAudit({
      user_id: req.user.id,
      document_id: documentId,
      action: `UPLOAD (v${nextVersion})`,
      req,
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to upload version" });
  }
};

/**
 * LIST document versions
 * Allowed: Public (published), Staff, Admin
 */
exports.getVersions = async (req, res) => {
  const { id } = req.params;

  try {
    // 🔍 Check document visibility
    const docRes = await pool.query(
      `
      SELECT visibility, status
      FROM documents
      WHERE id = $1
      `,
      [id]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    const doc = docRes.rows[0];

    if (
      req.user.role === "Public" &&
      (doc.visibility !== "public" || doc.status !== "published")
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.user.role === "Staff" && doc.visibility === "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      `
      SELECT v.id, v.version_number, v.file_type, v.file_size_bytes,
             v.created_at, u.email AS uploaded_by
      FROM document_versions v
      JOIN users u ON v.uploaded_by = u.id
      WHERE v.document_id = $1
      ORDER BY v.version_number DESC
      `,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch versions" });
  }
};

/**
 * DOWNLOAD document version
 * Publicly allowed ONLY if document is public & published
 */
exports.downloadVersion = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT v.file_path, v.document_id, v.version_number,
             d.visibility, d.status
      FROM document_versions v
      JOIN documents d ON v.document_id = d.id
      WHERE v.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Version not found" });
    }

    const version = result.rows[0];
    
    // Role determine karein (Agar token nahi hai toh 'Public')
    const userRole = req.user ? req.user.role : "Public";

    // 🔐 DOWNLOAD PERMISSIONS LOGIC
    if (userRole === "Public") {
      // Public user sirf wahi download kar sakta hai jo 'public' + 'published' ho
      if (version.visibility !== "public" || version.status !== "published") {
        return res.status(403).json({ message: "Download not allowed for private documents" });
      }
    } else if (userRole === "Staff") {
      // Staff 'admin' visibility wali files download nahi kar sakta
      if (version.visibility === "admin") {
        return res.status(403).json({ message: "Download not allowed" });
      }
    }

    // AUDIT DOWNLOAD (Sirf logged-in users ke liye track karein)
    if (req.user) {
      await logAudit({
      user_id: req.user ? req.user.id : null, // Login user hai toh ID, warna null
      document_id: version.document_id,
      action: `DOWNLOAD (v${version.version_number})${!req.user ? ' [PUBLIC]' : ''}`,
      req,
    });
    }

    // File download response
    res.download(version.file_path);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ message: "Failed to download file" });
  }
};
