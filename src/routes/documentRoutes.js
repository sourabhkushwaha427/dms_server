//src/routes/documentRoutes.js

const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");

const {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocumentStatus,
  deleteDocument,
  updateDocument
} = require("../controllers/documentController");

/**
 * @swagger
 * tags:
 *   name: Documents
 *   description: Document management APIs (Search, Pagination, Visibility)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: 9c1b2a3d-1234-4abc-9def-987654321abc
 *         title:
 *           type: string
 *           example: Leave Policy 2025
 *         description:
 *           type: string
 *           example: Company leave rules
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *         visibility:
 *           type: string
 *           enum: [public, staff, admin]
 *         category:
 *           type: string
 *           example: HR Policies
 *         created_by:
 *           type: string
 *           example: admin@gmail.com
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/documents:
 *   post:
 *     summary: Create a document (Staff, Admin only)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Leave Policy 2025
 *               description:
 *                 type: string
 *                 example: Company leave rules
 *               category_id:
 *                 type: string
 *                 nullable: true
 *                 example: 2a1b3c4d-aaaa-bbbb-cccc-123456789abc
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 example: draft
 *               visibility:
 *                 type: string
 *                 enum: [public, staff, admin]
 *                 example: staff
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       403:
 *         description: Forbidden
 */
router.post("/", auth, createDocument);

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: Get documents (Search, Filters & Pagination)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by document title
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, staff, admin]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Paginated document list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 */
router.get("/", auth, getDocuments); 


/**
 * @swagger
 * /api/documents/{id}:
 *   get:
 *     summary: Get single document (permission based)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 */
router.get("/:id",  getDocumentById);

/**
 * @swagger
 * /api/documents/{id}/status:
 *   patch:
 *     summary: Update document status (Staff, Admin only)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 example: published
 *     responses:
 *       200:
 *         description: Document status updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 */
router.patch(
  "/:id/status",
  auth,
  role(["Admin", "Staff"]),
  updateDocumentStatus
);


router.delete("/:id", auth, role(["Admin"]), deleteDocument);

router.put("/:id", auth, role(["Admin", "Staff"]), updateDocument);

module.exports = router;
