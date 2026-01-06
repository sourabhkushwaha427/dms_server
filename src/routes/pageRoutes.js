// src/routes/pageRoutes.js
const express = require("express");
const router = express.Router();
const { savePage, getPage, getAllPages } = require("../controllers/pageController");

router.post("/", savePage);       // Admin save karega
router.get("/", getAllPages);     // Navbar ke liye list
router.get("/:slug", getPage);    // Specific page view

module.exports = router;