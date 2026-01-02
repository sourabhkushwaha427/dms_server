// src/controllers/documentController.js

const pool = require("../config/db");
const path = require("path");

exports.createDocument = async (req, res) => {
  const { title, description, category_id, status, visibility } = req.body;
  const created_by = req.user.id;

  try {
    const result = await pool.query(
      `INSERT INTO documents (title, description, category_id, status, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description, category_id || null, status || "draft", visibility || "staff", created_by]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
};

// ✅ UPDATED FUNCTION: Recursive Category Search + Version ID Fetch
exports.getDocuments = async (req, res) => {
  try {
    const { search, category_id, status, visibility, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let queryParams = [];
    let whereClauses = [];
    let paramCounter = 1;

    // 1. Recursive Logic: Agar Category ID di gayi hai
    if (category_id) {
      const categoryQuery = `
        WITH RECURSIVE category_tree AS (
          SELECT id FROM categories WHERE id = $1
          UNION ALL
          SELECT c.id FROM categories c
          INNER JOIN category_tree ct ON c.parent_id = ct.id
        )
        SELECT id FROM category_tree
      `;
      
      const categoryResult = await pool.query(categoryQuery, [category_id]);
      const allCategoryIds = categoryResult.rows.map(row => row.id);
      
      if (allCategoryIds.length > 0) {
        whereClauses.push(`d.category_id = ANY($${paramCounter})`);
        queryParams.push(allCategoryIds);
        paramCounter++;
      } else {
        return res.json({ page: Number(page), limit: Number(limit), total: 0, data: [] });
      }
    }

    // 2. Status Filter
    if (status) {
      whereClauses.push(`d.status = $${paramCounter}`);
      queryParams.push(status);
      paramCounter++;
    }

    // 3. Search Filter
    if (search) {
      whereClauses.push(`d.title ILIKE $${paramCounter}`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    // 4. Visibility Logic
    if (visibility) {
      whereClauses.push(`d.visibility = $${paramCounter}`);
      queryParams.push(visibility);
      paramCounter++;
    } else {
      if (!req.user) {
         whereClauses.push(`d.visibility = 'public'`);
      } else if (req.user.role === 'Staff') {
         whereClauses.push(`d.visibility IN ('public', 'staff')`);
      }
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Count Total
    const countQuery = `SELECT COUNT(*) FROM documents d ${whereString}`;
    const countRes = await pool.query(countQuery, queryParams);
    const total = parseInt(countRes.rows[0].count);

    // ✅ MAIN FIX: Join document_versions to get version_id
    const dataQuery = `
      SELECT 
        d.*, 
        c.name as category,
        v.id as version_id,       -- ✅ YEAH MISSING THA
        v.file_type               -- ✅ File type bhi le lo
      FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      -- Join to get the ID of the CURRENT version
      LEFT JOIN document_versions v ON d.id = v.document_id AND d.current_version_num = v.version_number
      ${whereString}
      ORDER BY d.updated_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    queryParams.push(limit, offset);
    const dataRes = await pool.query(dataQuery, queryParams);

    res.json({
      page: Number(page),
      limit: Number(limit),
      total,
      data: dataRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getDocumentById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT 
         d.*, 
         c.name as category,
         v.id as version_id,      -- ✅ ADDED HERE TOO
         v.file_type 
       FROM documents d 
       LEFT JOIN categories c ON d.category_id = c.id 
       -- Join for Version Info
       LEFT JOIN document_versions v ON d.id = v.document_id AND d.current_version_num = v.version_number
       WHERE d.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Document not found" });

    const doc = result.rows[0];
    
    // Role based access check
    if (!req.user && doc.visibility !== 'public') return res.status(403).json({message: "Access Denied"});
    if (req.user && req.user.role === 'Staff' && doc.visibility === 'admin') return res.status(403).json({message: "Access Denied"});

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateDocumentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE documents SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteDocument = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM documents WHERE id = $1`, [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateDocument = async (req, res) => {
    const { id } = req.params;
    const { title, description, category_id, status, visibility } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE documents 
             SET title = $1, description = $2, category_id = $3, status = $4, visibility = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 RETURNING *`,
            [title, description, category_id, status, visibility, id]
        );
        
        if (result.rows.length === 0) return res.status(404).json({ message: "Document not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Update failed" });
    }
};