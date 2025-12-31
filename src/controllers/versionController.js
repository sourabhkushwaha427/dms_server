//src/controllers/versionController.js

const pool = require("../config/db");
const path = require("path");
const logAudit = require("../utils/auditLogger");

exports.uploadVersion = async (req, res) => {
  const documentId = req.params.id;

  if (req.user.role === "Public") {
    return res.status(403).json({ message: "Upload not allowed" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "File required" });
  }

  try {
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
 */
exports.getVersions = async (req, res) => {
  const { id } = req.params;

  try {
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
 */
exports.downloadVersion = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Database se file details nikalo (file_type zaroori hai)
    const result = await pool.query(
      `
      SELECT v.file_path, v.file_type, v.document_id, v.version_number,
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
    const userRole = req.user ? req.user.role : "Public";

    // 2. Permission Logic Check Karo
    if (userRole === "Public") {
      if (version.visibility !== "public" || version.status !== "published") {
        return res.status(403).json({ message: "Download not allowed for private documents" });
      }
    } else if (userRole === "Staff") {
      if (version.visibility === "admin") {
        return res.status(403).json({ message: "Download not allowed" });
      }
    }

    // 3. Audit Log (Agar user logged in hai)
    if (req.user) {
      await logAudit({
        user_id: req.user.id,
        document_id: version.document_id,
        action: `DOWNLOAD (v${version.version_number})`,
        req,
      });
    }

    // 4. ✅ FIX: Browser ko sahi Content-Type batana
    // Isse browser file ko text samajhne ki galti nahi karega
    const fileExtension = version.file_type ? version.file_type.toLowerCase() : '';
    
    let contentType = 'application/octet-stream'; // Default binary

    if (fileExtension === '.pdf') contentType = 'application/pdf';
    if (fileExtension === '.png') contentType = 'image/png';
    if (fileExtension === '.jpg' || fileExtension === '.jpeg') contentType = 'image/jpeg';
    if (fileExtension === '.doc') contentType = 'application/msword';
    if (fileExtension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (fileExtension === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // Header set karein
    res.set('Content-Type', contentType);

    // Filename banayein
    const downloadName = `document_v${version.version_number}${version.file_type}`;
    
    // 5. Download Start
    res.download(version.file_path, downloadName);

  } catch (error) {
    console.error("Download Error:", error);
    if (!res.headersSent) {
        res.status(500).json({ message: "Failed to download file" });
    }
  }
};