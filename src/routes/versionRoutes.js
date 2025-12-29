//src/routes/versionRoutes.js

const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const upload = require("../config/multer");

const {
  uploadVersion,
  getVersions,
  downloadVersion,
} = require("../controllers/versionController");

/**
 * @swagger
 * tags:
 *   name: Versions
 *   description: Document version management APIs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     DocumentVersion:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: a1b2c3d4-1111-2222-3333-abcdefabcdef
 *         version_number:
 *           type: integer
 *           example: 2
 *         file_type:
 *           type: string
 *           example: .pdf
 *         file_size_bytes:
 *           type: integer
 *           example: 245678
 *         uploaded_by:
 *           type: string
 *           example: admin@gmail.com
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/documents/{id}/versions:
 *   post:
 *     summary: Upload new document version (Staff, Admin only)
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Document ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Version uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentVersion'
 *       400:
 *         description: File missing
 *       403:
 *         description: Upload not allowed
 *       404:
 *         description: Document not found
 */
router.post(
  "/documents/:id/versions",
  auth,
  upload.single("file"),
  uploadVersion
);

/**
 * @swagger
 * /api/documents/{id}/versions:
 *   get:
 *     summary: Get document versions (visibility based)
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Document ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Version list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DocumentVersion'
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 */
router.get("/documents/:id/versions", auth, getVersions);

/**
 * @swagger
 * /api/versions/{id}/download:
 * get:
 * summary: Download document version (Public/Staff/Admin)
 * tags: [Versions]
 * parameters:
 * - in: path
 * name: id
 * required: true
 * description: Version ID
 * schema:
 * type: string
 * responses:
 * 200:
 * description: File downloaded
 * 403:
 * description: Download not allowed for private documents
 * 404:
 * description: Version not found
 */
router.get("/versions/:id/download", auth, downloadVersion);

module.exports = router;
