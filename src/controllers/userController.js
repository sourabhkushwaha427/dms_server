exports.getUsers = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Users fetched successfully",
    user: req.user || null,
  });
};
