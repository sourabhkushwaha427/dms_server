const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Agar token NAHI hai -> Role "Public" set karo aur controller pe bhejo
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = { role: "Public" }; 
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (error) {
    // Agar token invalid/expired hai, tab bhi guest ki tarah aage badhne do
    req.user = { role: "Public" };
    next();
  }
};