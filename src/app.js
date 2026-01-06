const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const documentRoutes = require("./routes/documentRoutes");
const versionRoutes = require("./routes/versionRoutes");
const auditRoutes = require("./routes/auditRoutes");
const pageRoutes = require("./routes/pageRoutes");

const app = express();

// Middlewares
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(morgan("dev"));

// Swagger route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API routes
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api", versionRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/pages", pageRoutes);

// Default route
app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
