const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    // Real-time role check
    try {
      const [users] = await db.query('SELECT role FROM users WHERE id = ?', [decoded.userId]);

      if (users.length === 0) {
        return res.status(401).json({ message: 'User no longer exists' });
      }

      req.userRole = users[0].role;
      next();
    } catch (dbError) {
      console.error('Database error in auth middleware:', dbError);
      return res.status(500).json({ message: 'Internal server error during authentication' });
    }
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
