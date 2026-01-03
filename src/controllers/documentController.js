// src/controllers/documentController.js

const pool = require("../config/db");
const path = require("path");
// ✅ Top par ye imports add karein
const ExcelJS = require('exceljs');
const HTMLtoDOCX = require('html-to-docx');
const xlsx = require('xlsx'); // import xlsx library
const fs = require('fs'); // needed to read file from path

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




// src/controllers/documentController.js

exports.updateDocumentContent = async (req, res) => {
  const { id } = req.params;
  // ✅ category_id bhi receive karein
  const { content_data, doc_source_type, category_id } = req.body; 

  try {
    const result = await pool.query(
      `UPDATE documents 
       SET content_data = $1, doc_source_type = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [content_data, doc_source_type, category_id, id] // 👈 category_id pass kiya
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Save Error:", err);
    res.status(500).json({ message: "Save failed" });
  }
};


exports.downloadDocumentContent = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`SELECT * FROM documents WHERE id = $1`, [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ message: "Not found" });
    }

    const doc = result.rows[0];
    let content = doc.content_data;

    // Unwrap wrapper if exists
    if (content && content.data) {
        content = content.data;
    }

    // === CASE 1: EXCEL SHEET ===
    if (doc.doc_source_type === 'sheet') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet 1');

      let sheetRows = [];
      let sheetStyles = {};

      // ✅ Handle New Structure (Cells + Style)
      if (content && !Array.isArray(content) && content.cells) {
          sheetRows = content.cells;
          sheetStyles = content.style || {};
      } 
      // Handle Old Structure (Array only)
      else if (Array.isArray(content)) {
          sheetRows = content;
      }

      // Add Data
      if (sheetRows.length > 0) {
          worksheet.addRows(sheetRows);
      }

      // ✅ APPLY STYLES
      if (sheetStyles) {
          Object.keys(sheetStyles).forEach(cellKey => {
              try {
                  const cell = worksheet.getCell(cellKey); // e.g. 'A1'
                  const cssString = sheetStyles[cellKey]; // e.g. "background-color:red; font-weight:bold;"
                  
                  // Simple CSS Parser
                  if (cssString.includes('font-weight: bold') || cssString.includes('font-weight:bold')) {
                      cell.font = { ...cell.font, bold: true };
                  }
                  if (cssString.includes('font-style: italic') || cssString.includes('font-style:italic')) {
                      cell.font = { ...cell.font, italic: true };
                  }
                  if (cssString.includes('text-decoration: underline')) {
                      cell.font = { ...cell.font, underline: true };
                  }
                  
                  // Background Color Parser
                  const bgMatch = cssString.match(/background-color:\s*(#[0-9a-fA-F]+)/);
                  if (bgMatch) {
                      const colorHex = bgMatch[1].replace('#', '');
                      cell.fill = {
                          type: 'pattern',
                          pattern: 'solid',
                          fgColor: { argb: 'FF' + colorHex }
                      };
                  }

                  // Text Color Parser
                  const colorMatch = cssString.match(/color:\s*(#[0-9a-fA-F]+)/);
                  if (colorMatch) {
                      const colorHex = colorMatch[1].replace('#', '');
                      cell.font = { ...cell.font, color: { argb: 'FF' + colorHex } };
                  }

              } catch (e) {
                  console.error("Style apply error", e);
              }
          });
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${doc.title || 'document'}.xlsx`);
      
      await workbook.xlsx.write(res);
      res.end();
    } 
    
    // === CASE 2: WORD DOCUMENT ===
    else if (doc.doc_source_type === 'rich_text') {
      let htmlString = (typeof content === 'string') ? content : (content?.data || "<p></p>");
      
      const fileBuffer = await HTMLtoDOCX(htmlString, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename=${doc.title || 'document'}.docx`);
      res.send(fileBuffer);
    } 
    else {
      res.status(400).json({ message: "Invalid document type" });
    }

  } catch (err) {
    console.error("Download Error:", err);
    if (!res.headersSent) res.status(500).json({ message: "Download failed" });
  }
};



exports.importDocument = async (req, res) => {
  const { title, description, category_id, status, visibility } = req.body;
  const created_by = req.user.id;

  if (!req.file) {
    return res.status(400).json({ message: "Excel file is required" });
  }

  try {
    // 1. Read the uploaded file
    const workbook = xlsx.readFile(req.file.path); // Read file from disk
    const sheetName = workbook.SheetNames[0]; // Get first sheet
    const worksheet = workbook.Sheets[sheetName];

    // 2. Convert to JSON (2D Array)
    // header: 1 ensures we get an array of arrays [ ["A1", "B1"], ["A2", "B2"] ]
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    // 3. Prepare content_data for Jspreadsheet
    // Wrapper object expected by your frontend logic
    const content_data = {
      data: jsonData,
      style: {} // You can extract styles here if 'xlsx' supports it (complex)
    };

    // 4. Save to Database
    const result = await pool.query(
      `INSERT INTO documents (title, description, category_id, status, visibility, created_by, doc_source_type, content_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title || req.file.originalname, // Use filename if title is missing
        description,
        category_id || null,
        status || "draft",
        visibility || "staff",
        created_by,
        'sheet', // Set type to 'sheet'
        JSON.stringify(content_data) // Save converted JSON
      ]
    );

    // 5. Cleanup: Delete uploaded temp file
    fs.unlinkSync(req.file.path);

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("Import Error:", err);
    // Cleanup even on error
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: "Failed to import document" });
  }
};