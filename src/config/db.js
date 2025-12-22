const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
});

pool.connect()
  .then(() => console.log("PostgreSQL Connected"))
  .catch(err => console.error("Connection Error:", err));

module.exports = pool;

