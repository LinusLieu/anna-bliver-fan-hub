const jwt = require('jsonwebtoken');
const db = require('../config/database');

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    // Real-time role check (optional, but good to have if token is valid)
    try {
      const [users] = await db.query('SELECT role FROM users WHERE id = ?', [decoded.userId]);

      if (users.length > 0) {
        req.userRole = users[0].role;
      }
    } catch (dbError) {
      console.error('Database error in optional auth middleware:', dbError);
    }

    next();
  } catch (error) {
    // If token is invalid, just proceed as guest
    next();
  }
};

module.exports = optionalAuthMiddleware;
