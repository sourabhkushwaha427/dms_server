//src/controllers/documentController.js

const pool = require("../config/db");
const logAudit = require("../utils/auditLogger");

/**
 * CREATE document
 * Admin / Staff only
 */
exports.createDocument = async (req, res) => {
  const {
    title,
    description,
    category_id,
    status = "draft",
    visibility = "staff",
  } = req.body;

  if (req.user.role === "Public") {
    return res.status(403).json({ message: "Not allowed to create document" });
  }

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const allowedVisibility = ["public", "staff", "admin"];
  const allowedStatus = ["draft", "published", "archived"];

  if (!allowedVisibility.includes(visibility)) {
    return res.status(400).json({ message: "Invalid visibility value" });
  }

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO documents
      (title, description, category_id, status, visibility, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [title, description, category_id || null, status, visibility, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create document" });
  }
};

/**
 * GET all documents
 * 🔎 Search + Filters + Pagination + Visibility
 */
exports.getDocuments = async (req, res) => {
  const {
    search,
    category_id,
    status,
    visibility,
    page = 1,
    limit = 10,
  } = req.query;

  const offset = (page - 1) * limit;

  let conditions = [];
  let values = [];
  let idx = 1;

  // 🔎 SEARCH (title)
  if (search) {
    conditions.push(`d.title ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }

  // 🗂 CATEGORY
  if (category_id) {
    conditions.push(`d.category_id = $${idx++}`);
    values.push(category_id);
  }

  // 📌 STATUS
  if (status) {
    conditions.push(`d.status = $${idx++}`);
    values.push(status);
  }

  // 👁 VISIBILITY FILTER
  if (visibility) {
    conditions.push(`d.visibility = $${idx++}`);
    values.push(visibility);
  }

  // 🔐 ROLE-BASED VISIBILITY
  if (req.user.role === "Public") {
    conditions.push(`d.visibility = 'public'`);
    conditions.push(`d.status = 'published'`);
  }

  if (req.user.role === "Staff") {
    conditions.push(`d.visibility IN ('public','staff')`);
    conditions.push(`d.status = 'published'`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // 📄 DATA QUERY
    const dataQuery = `
      SELECT d.id, d.title, d.status, d.visibility, d.created_at,
             c.name AS category,
             u.email AS created_by
      FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      JOIN users u ON d.created_by = u.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    values.push(limit, offset);

    const data = await pool.query(dataQuery, values);

    // 📊 TOTAL COUNT
    const countQuery = `
      SELECT COUNT(*) FROM documents d ${whereClause}
    `;

    const total = await pool.query(
      countQuery,
      values.slice(0, values.length - 2)
    );

    res.json({
      page: Number(page),
      limit: Number(limit),
      total: Number(total.rows[0].count),
      data: data.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
};

/**
 * GET single document
 */
exports.getDocumentById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT d.*, c.name AS category, u.email AS created_by
      FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      JOIN users u ON d.created_by = u.id
      WHERE d.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    const doc = result.rows[0];

    // 🔐 VISIBILITY RULES
    if (
      req.user.role === "Public" &&
      (doc.visibility !== "public" || doc.status !== "published")
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.user.role === "Staff" && doc.visibility === "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    await logAudit({
      user_id: req.user.id,
      document_id: id,
      action: "VIEW DOCUMENT",
      req,
    });

    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch document" });
  }
};

/**
 * UPDATE document status
 */
exports.updateDocumentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (req.user.role === "Public") {
    return res.status(403).json({ message: "Not allowed" });
  }

  const allowedStatus = ["draft", "published", "archived"];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE documents
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update status" });
  }
};
