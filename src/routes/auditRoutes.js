const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const { getAuditLogs } = require("../controllers/auditController");

/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: Audit Logs APIs (Admin only)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuditLog:
 *       type: object
 *       properties:
 *         action:
 *           type: string
 *           example: DOWNLOAD (v2)
 *         user:
 *           type: string
 *           example: admin@gmail.com
 *         document:
 *           type: string
 *           example: Leave Policy
 *         version_number:
 *           type: integer
 *           example: 2
 *         file_name:
 *           type: string
 *           example: leave_policy_v2.pdf
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Get audit logs (Admin only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit logs list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AuditLog'
 *       403:
 *         description: Forbidden (not Admin)
 *       401:
 *         description: Unauthorized
 */
router.get("/", auth, role(["Admin"]), getAuditLogs);

module.exports = router;
