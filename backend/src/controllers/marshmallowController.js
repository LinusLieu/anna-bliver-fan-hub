const db = require('../config/database');
const crypto = require('crypto');
const { verifyCaptcha } = require('../utils/aliyunCaptcha');
const { sendMarshmallowNotificationEmail } = require('../utils/emailService');

// Create a new marshmallow
exports.createMarshmallow = async (req, res) => {
  try {
    const { title, sender_alias, content, captchaVerifyParam } = req.body;
    // Optional auth: req.userId might be set if optionalAuth middleware is used
    const userId = req.userId || null;
    const uuid = crypto.randomUUID();

    // 未登录用户需要验证验证码
    if (!userId) {
      const captchaResult = await verifyCaptcha(captchaVerifyParam, process.env.ALIYUN_CAPTCHA_SCENE_ID);
      if (!captchaResult.success) {
        return res.status(400).json({ message: `验证码校验失败: ${captchaResult.message}`, captchaFailed: true });
      }
    }

    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const [result] = await db.query(
      'INSERT INTO marshmallows (uuid, title, sender_alias, content, user_id) VALUES (?, ?, ?, ?, ?)',
      [uuid, title || null, sender_alias || '匿名的猪小娜', content, userId]
    );

    try {
      await sendMarshmallowNotificationEmail({
        sender: sender_alias || '匿名的猪小娜',
        title: title || '无标题棉花糖',
        content
      });
    } catch (emailError) {
      console.error('发送棉花糖提醒邮件失败:', emailError);
    }

    res.status(201).json({
      message: 'Marshmallow sent successfully',
      id: uuid // Return UUID instead of internal ID
    });
  } catch (error) {
    console.error('Error creating marshmallow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get current user's marshmallows
exports.getMyMarshmallows = async (req, res) => {
  try {
    const userId = req.userId;

    const [marshmallows] = await db.query(
      'SELECT * FROM marshmallows WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    res.json(marshmallows);
  } catch (error) {
    console.error('Error fetching user marshmallows:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Bind a marshmallow to the current user
exports.bindMarshmallow = async (req, res) => {
  try {
    const { marshmallowId } = req.body;
    const userId = req.userId;

    if (!marshmallowId) {
      return res.status(400).json({ message: 'Marshmallow ID is required' });
    }

    // Check if marshmallow exists and is not already bound
    // Use UUID for lookup
    const [marshmallows] = await db.query(
      'SELECT * FROM marshmallows WHERE uuid = ?',
      [marshmallowId]
    );

    if (marshmallows.length === 0) {
      return res.status(404).json({ message: 'Marshmallow not found' });
    }

    if (marshmallows[0].user_id) {
      return res.status(400).json({ message: 'Marshmallow is already bound to a user' });
    }

    await db.query(
      'UPDATE marshmallows SET user_id = ? WHERE uuid = ?',
      [userId, marshmallowId]
    );

    res.json({ message: 'Marshmallow bound successfully' });
  } catch (error) {
    console.error('Error binding marshmallow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Get all marshmallows
exports.getAllMarshmallows = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const userId = req.userId;

    const [marshmallows] = await db.query(
      `SELECT m.*, u.username as sender_username, mr.read_at as user_read_at
       FROM marshmallows m
       LEFT JOIN users u ON m.user_id = u.id
       LEFT JOIN marshmallow_reads mr ON m.id = mr.marshmallow_id AND mr.user_id = ?
       ORDER BY m.created_at DESC`,
      [userId]
    );

    res.json(marshmallows);
  } catch (error) {
    console.error('Error fetching all marshmallows:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Mark marshmallow as read
exports.markAsRead = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const userId = req.userId;

    await db.query(
      'INSERT IGNORE INTO marshmallow_reads (user_id, marshmallow_id) VALUES (?, ?)',
      [userId, id]
    );

    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking marshmallow as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Delete marshmallows (batch)
exports.deleteMarshmallows = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    await db.query(
      'DELETE FROM marshmallows WHERE id IN (?)',
      [ids]
    );

    res.json({ message: 'Marshmallows deleted successfully' });
  } catch (error) {
    console.error('Error deleting marshmallows:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Reply to a marshmallow
exports.replyMarshmallow = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { reply_content } = req.body;

    if (!reply_content) {
      return res.status(400).json({ message: 'Reply content is required' });
    }

    await db.query(
      'UPDATE marshmallows SET reply_content = ?, reply_at = NOW(), is_read = FALSE WHERE id = ?',
      [reply_content, id]
    );

    res.json({ message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Error replying to marshmallow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
