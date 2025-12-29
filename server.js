require("dotenv").config();
const app = require("./src/app");
require("./src/config/db"); 

const PORT = process.env.PORT || 4002;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
