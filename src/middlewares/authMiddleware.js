const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // AGAR TOKEN NAHI HAI: Toh error mat do (Unauthorized mat bhejo)
  // Bas user ko "Public" role de do aur aage badhne do
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = { role: "Public" }; 
    return next(); // Aage controller pe bhej do
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role: "Admin" or "Staff" }
    next();
  } catch (error) {
    // Agar token expire ho gaya ya invalid hai, tab bhi portal crash na ho
    // Isliye ise bhi "Public" maan lo (Ya fir login page pe bhejne ke liye 401 de sakte ho)
    req.user = { role: "Public" };
    next();
  }
};