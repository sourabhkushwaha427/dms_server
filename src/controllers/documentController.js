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
    // 1. Delete Query
    const result = await pool.query(`DELETE FROM documents WHERE id = $1`, [id]);

    // 2. Check if anything was actually deleted
    if (result.rowCount === 0) {
        // Agar rowCount 0 hai, iska matlab delete nahi hua
        return res.status(404).json({ message: "Document not found or could not be deleted." });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    // Agar Foreign Key constraint ka error aaya
    if (err.code === '23503') { 
        return res.status(400).json({ message: "Cannot delete: This document is linked to other records." });
    }
    res.status(500).json({ message: "Server error during deletion" });
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
  const { content_data, doc_source_type, category_id } = req.body; 

  try {
    const result = await pool.query(
      `UPDATE documents 
       SET content_data = $1, doc_source_type = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [content_data, doc_source_type, category_id, id]
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




//  UPDATED IMPORT FUNCTION (Extracts Styles, Merges, & Widths)
exports.importDocument = async (req, res) => {
  const { title, description, category_id, status, visibility } = req.body;
  const created_by = req.user.id;

  if (!req.file) {
    return res.status(400).json({ message: "Excel file is required" });
  }

  try {
    // 1. Load Workbook using ExcelJS (Better for Styles)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    
    const worksheet = workbook.worksheets[0]; // Get first sheet

    // Data Holders
    let matrix = [];
    let style = {};
    let mergeCells = {};
    let columns = [];

    // 2. Extract Column Widths
    if (worksheet.columns) {
        worksheet.columns.forEach((col, index) => {
            if (col.width) {
                columns.push({ width: Math.round(col.width * 8) }); // Approx conversion factor
            } else {
                columns.push({ width: 100 }); // Default
            }
        });
    }

    // 3. Loop through Rows & Cells to extract Data + Styles
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const rowData = [];
        const rowIndex = rowNumber - 1; // 0-based index for Jspreadsheet

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colIndex = colNumber - 1; // 0-based index
            const cellRef = getColumnName(colIndex) + (rowIndex + 1); // e.g., A1, B2

            // A. Get Value
            let cellValue = cell.value;
            // Handle Rich Text or Formulas
            if (typeof cellValue === 'object' && cellValue !== null) {
                if (cellValue.result !== undefined) cellValue = cellValue.result; // Formula result
                else if (cellValue.richText) cellValue = cellValue.richText.map(t => t.text).join(''); // Rich text
            }
            rowData[colIndex] = cellValue || "";

            // B. Get Styles (CSS Generation)
            let cssArr = [];
            
            // Bold / Italic
            if (cell.font) {
                if (cell.font.bold) cssArr.push('font-weight: bold');
                if (cell.font.italic) cssArr.push('font-style: italic');
                if (cell.font.color && cell.font.color.argb) {
                    const color = argbToHex(cell.font.color.argb);
                    if(color) cssArr.push(`color: ${color}`);
                }
            }

            // Background Color
            if (cell.fill && cell.fill.type === 'pattern' && cell.fill.fgColor) {
                const bgColor = argbToHex(cell.fill.fgColor.argb);
                if(bgColor) cssArr.push(`background-color: ${bgColor}`);
            }

            // Alignment
            if (cell.alignment) {
                if (cell.alignment.horizontal) cssArr.push(`text-align: ${cell.alignment.horizontal}`);
                if (cell.alignment.vertical) {
                    let vAlign = cell.alignment.vertical;
                    if(vAlign === 'center') vAlign = 'middle';
                    cssArr.push(`vertical-align: ${vAlign}`);
                }
            }

            if (cssArr.length > 0) {
                style[cellRef] = cssArr.join(';');
            }
            matrix[rowIndex] = rowData;
        });
        
        matrix[rowIndex] = rowData;
    });

    // 4. Extract Merged Cells
    // ExcelJS returns merged cells as object inside worksheet._merges (internal) or we check cells
    // Safe way: Iterate model merges
    if (worksheet.model && worksheet.model.merges) {
        worksheet.model.merges.forEach(mergeRange => {
            // mergeRange is like "A1:B2" or object {top, left, bottom, right}
            // Jspreadsheet needs: "A1": [colspan, rowspan]
            
            // We need to parse range manually or use ExcelJS range
            // Let's assume ExcelJS gives string "A1:C3" in recent versions, or convert logic:
            // Since accessing internal model is risky, let's try a safe logic if available, 
            // but usually looping through merges is complex.
            // Simplified Approach for common Merges:
            try {
                 // Decode Range (e.g. A1:B2)
                 // Note: This requires a helper or simple logic. 
                 // Assuming mergeRange is a string "A1:B2"
                 const range = decodeRange(mergeRange); 
                 const rowspan = range.e.r - range.s.r + 1;
                 const colspan = range.e.c - range.s.c + 1;
                 
                 // Jspreadsheet format: { "A1": [colspan, rowspan] }
                 const startCell = getColumnName(range.s.c) + (range.s.r + 1);
                 
                 if (rowspan > 1 || colspan > 1) {
                     mergeCells[startCell] = [colspan, rowspan];
                 }
            } catch(e) { console.log("Merge parse error", e); }
        });
    }

    // 5. Final Object Construction
    const content_data = {
      data: matrix,
      style: style,
      mergeCells: mergeCells,
      columns: columns
    };

    // 6. Save to Database
    const result = await pool.query(
      `INSERT INTO documents (title, description, category_id, status, visibility, created_by, doc_source_type, content_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title || req.file.originalname, 
        description,
        category_id || null,
        status || "draft",
        visibility || "staff",
        created_by,
        'sheet', 
        JSON.stringify(content_data) 
      ]
    );

    fs.unlinkSync(req.file.path);
    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("Import Error:", err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: "Failed to import document" });
  }
};

// ================= HELPER FUNCTIONS (Add these at the bottom of the file) =================

// 1. Convert Column Index to Letter (0 -> A, 1 -> B)
function getColumnName(index) {
    let columnName = "";
    let i = index;
    while (i >= 0) {
        columnName = String.fromCharCode((i % 26) + 65) + columnName;
        i = Math.floor(i / 26) - 1;
    }
    return columnName;
}

// 2. Convert Excel ARGB to CSS Hex
function argbToHex(argb) {
    if (!argb) return null;
    // Excel ARGB is usually 'FFFF0000' (Alpha, Red, Green, Blue)
    // CSS needs '#FF0000'
    if (typeof argb === 'string' && argb.length === 8) {
        return '#' + argb.slice(2); 
    }
    return '#' + argb; // Fallback
}

// 3. Decode Range "A1:B2" -> {s:{c:0, r:0}, e:{c:1, r:1}}
function decodeRange(range) {
    const parts = range.split(':');
    const start = parseCell(parts[0]);
    const end = parseCell(parts[1]);
    return { s: start, e: end };
}

function parseCell(cell) {
    const letters = cell.replace(/[0-9]/g, '');
    const numbers = cell.replace(/[A-Z]/g, '');
    
    // Column Letter to Index
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
        col += (letters.charCodeAt(i) - 64) * Math.pow(26, letters.length - i - 1);
    }
    return { c: col - 1, r: parseInt(numbers) - 1 };
}