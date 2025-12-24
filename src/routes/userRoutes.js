const express = require("express");
const router = express.Router();
const { getUsers, deleteUser } = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");

// Dashboard se hit hone wala route
router.get("/", authMiddleware, getUsers); 
router.delete("/:id", authMiddleware, deleteUser);

module.exports = router;