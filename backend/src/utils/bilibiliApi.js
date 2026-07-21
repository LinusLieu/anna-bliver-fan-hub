const axios = require('axios');

// 缓存主播信息，减少API请求
const anchorInfoCache = new Map();
const userInfoCache = new Map();
const batchUserInfoCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存
let generatedBuvid3 = null;

function generateBuvid3() {
  const chars = '0123456789ABCDEF';
  const randomChars = (length) => Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const suffix = `${Date.now() % 100000}`.padStart(5, '0') + 'infoc';
  return `${randomChars(8)}-${randomChars(4)}-${randomChars(4)}-${randomChars(4)}-${randomChars(12)}${suffix}`;
}

function getBilibiliCookieHeader() {
  const cookie = (process.env.BILIBILI_COOKIE || process.env.BILI_COOKIE || '').trim();
  if (!cookie) return '';

  if (/buvid3=/i.test(cookie)) return cookie;
  if (!generatedBuvid3) generatedBuvid3 = generateBuvid3();
  return `${cookie};buvid3=${generatedBuvid3}`;
}

function withBilibiliCookie(headers = {}) {
  const cookie = getBilibiliCookieHeader();
  return cookie ? { ...headers, Cookie: cookie } : headers;
}

/**
 * 获取主播信息（带缓存）
 * @param {number} uid - 主播的mid
 * @returns {Promise<Object>} 主播信息
 */
async function getAnchorInfo(uid) {
  const cacheKey = `anchor_${uid}`;
  const cached = anchorInfoCache.get(cacheKey);

  // 检查缓存是否有效
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // 调用B站API获取主播信息
    const response = await axios.get('https://api.live.bilibili.com/live_user/v1/Master/info', {
      params: { uid },
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data.code === 0 && response.data.data) {
      const data = response.data.data;
      const anchorInfo = {
        uid: data.info.uid,
        uname: data.info.uname,
        face: data.info.face,
        room_id: data.room_id
      };

      // 存入缓存
      anchorInfoCache.set(cacheKey, {
        data: anchorInfo,
        timestamp: Date.now()
      });

      return anchorInfo;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching anchor info for uid ${uid}:`, error.message);
    // 如果有旧缓存，即使过期也返回
    if (cached) {
      return cached.data;
    }
    return null;
  }
}

/**
 * 获取直播间信息（用于获取uid）
 * @param {number} roomId - 直播间ID
 * @returns {Promise<Object>} 直播间信息
 */
async function getRoomInfo(roomId) {
  try {
    const response = await axios.get('https://api.live.bilibili.com/room/v1/Room/get_info', {
      params: { room_id: roomId },
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data.code === 0 && response.data.data) {
      return response.data.data;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching room info for room ${roomId}:`, error.message);
    return null;
  }
}

/**
 * 批量获取房间的主播信息
 * @param {Array<number>} roomIds - 房间ID列表
 * @returns {Promise<Map<number, Object>>} 房间ID到主播信息的映射
 */
async function batchGetAnchorInfo(roomIds) {
  const result = new Map();

  // 并发获取所有房间信息
  const roomInfoPromises = roomIds.map(async (roomId) => {
    try {
      const roomInfo = await getRoomInfo(roomId);
      if (roomInfo && roomInfo.uid) {
        const anchorInfo = await getAnchorInfo(roomInfo.uid);
        if (anchorInfo) {
          result.set(roomId, anchorInfo);
        }
      }
    } catch (error) {
      console.error(`Error processing room ${roomId}:`, error.message);
    }
  });

  await Promise.all(roomInfoPromises);
  return result;
}

/**
 * 获取用户个人信息（带缓存）
 * @param {number} mid - 用户mid
 * @returns {Promise<Object>} 用户信息
 */
async function getUserInfo(mid) {
  const cacheKey = `user_${mid}`;
  const cached = userInfoCache.get(cacheKey);

  // 检查缓存是否有效
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const headers = withBilibiliCookie({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://space.bilibili.com/",
      "Origin": "https://space.bilibili.com",
    });

    const response = await axios.get('https://api.bilibili.com/x/web-interface/card', {
      params: {
        mid: mid,
        photo: 'true'
      },
      headers: headers,
      timeout: 5000
    });

    if (response.data.code === 0 && response.data.data) {
      const cardData = response.data.data;
      const userInfo = {
        mid: mid,
        name: cardData.card?.name || "未知",
        face: cardData.card?.face || "",
        fans: cardData.follower || 0,
        likes: cardData.like_num || 0,
        archive_count: cardData.archive_count || 0,
        sign: cardData.card?.sign || "只有音乐最安全~"
      };

      // 存入缓存
      userInfoCache.set(cacheKey, {
        data: userInfo,
        timestamp: Date.now()
      });

      return userInfo;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching user info for mid ${mid}:`, error.message);
    // 如果有旧缓存，即使过期也返回
    if (cached) {
      return cached.data;
    }
    return null;
  }
}

function normalizeUserInfo(mid, raw) {
  if (!raw) return null;

  const card = raw.card || raw;
  const name = card.name || card.uname || raw.name || raw.uname || '';
  const face = card.face || raw.face || '';

  if (!name && !face) return null;
  return {
    mid: String(mid),
    name,
    face
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 批量获取B站用户信息（带缓存，失败时回退到单个接口）
 * @param {Array<string|number>} uids - B站UID列表
 * @returns {Promise<Object>} { [uid]: { mid, name, face } }
 */
async function batchGetUserInfo(uids) {
  const uniqueUids = [...new Set((uids || []).map(uid => String(uid || '').trim()).filter(uid => /^\d+$/.test(uid)))];
  const result = {};
  const missing = [];
  const now = Date.now();

  for (const uid of uniqueUids) {
    const cached = userInfoCache.get(`user_${uid}`);
    const batchCached = batchUserInfoCache.get(`batch_user_${uid}`);
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      result[uid] = cached.data;
    } else if (batchCached && now - batchCached.timestamp < CACHE_DURATION) {
      result[uid] = batchCached.data;
    } else {
      missing.push(uid);
    }
  }

  if (missing.length === 0) return result;

  const headers = withBilibiliCookie({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Referer": "https://live.bilibili.com/",
    "Origin": "https://live.bilibili.com",
  });

  const stillMissing = new Set(missing);
  const chunkSize = 50;

  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);

    try {
      const response = await axios.get('https://api.bilibili.com/x/polymer/pc-electron/v1/user/cards', {
        params: { uids: chunk.join(',') },
        headers,
        timeout: 8000
      });

      if (response.data?.code !== 0 || !response.data?.data) {
        throw new Error(response.data?.message || 'Bilibili batch user API failed');
      }

      for (const uid of chunk) {
        const raw = response.data.data[String(uid)];
        const userInfo = normalizeUserInfo(uid, raw);
        if (!userInfo) continue;

        result[String(uid)] = userInfo;
        stillMissing.delete(String(uid));
        batchUserInfoCache.set(`batch_user_${uid}`, {
          data: userInfo,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error(`Batch fetching Bilibili users failed (${chunk[0]}...):`, error.message);
      break;
    }

    await sleep(200);
  }

  for (const uid of stillMissing) {
    try {
      const userInfo = await getUserInfo(uid);
      const normalized = normalizeUserInfo(uid, userInfo);
      if (normalized) {
        result[String(uid)] = normalized;
      }
    } catch (error) {
      console.error(`Fallback fetching Bilibili user ${uid} failed:`, error.message);
    }
    await sleep(100);
  }

  return result;
}

/**
 * 清除指定uid的缓存
 * @param {number} uid - 主播uid
 */
function clearAnchorCache(uid) {
  const cacheKey = `anchor_${uid}`;
  anchorInfoCache.delete(cacheKey);
}

/**
 * 清除用户信息缓存
 * @param {number} mid - 用户mid
 */
function clearUserCache(mid) {
  const cacheKey = `user_${mid}`;
  userInfoCache.delete(cacheKey);
  batchUserInfoCache.delete(`batch_user_${mid}`);
}

/**
 * 清除所有缓存
 */
function clearAllCache() {
  anchorInfoCache.clear();
  userInfoCache.clear();
  batchUserInfoCache.clear();
}

// ================================
// B站二维码登录相关API
// ================================

// 存储正在进行的登录会话
const qrcodeSessions = new Map();
const SESSION_TIMEOUT = 180000; // 180秒超时

/**
 * 申请B站登录二维码 (Web端)
 * @returns {Promise<Object>} 二维码数据 {url, qrcode_key}
 */
async function generateLoginQRCode() {
  try {
    const response = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });

    if (response.data.code === 0 && response.data.data) {
      const { url, qrcode_key } = response.data.data;

      // 存储会话信息
      qrcodeSessions.set(qrcode_key, {
        createdAt: Date.now(),
        status: 'pending'
      });

      // 设置超时自动清理
      setTimeout(() => {
        qrcodeSessions.delete(qrcode_key);
      }, SESSION_TIMEOUT);

      return {
        success: true,
        url,
        qrcode_key
      };
    }

    return {
      success: false,
      error: response.data.message || '生成二维码失败'
    };
  } catch (error) {
    console.error('生成登录二维码失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 轮询检查二维码扫描状态
 * @param {string} qrcodeKey - 二维码秘钥
 * @returns {Promise<Object>} 扫描状态和登录结果
 */
async function pollQRCodeStatus(qrcodeKey) {
  try {
    const response = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll', {
      params: { qrcode_key: qrcodeKey },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });

    if (response.data.code !== 0) {
      return {
        success: false,
        status: 'error',
        error: response.data.message
      };
    }

    const data = response.data.data;
    const statusCode = data.code;

    switch (statusCode) {
      case 0: {
        // 登录成功 - 从URL中解析cookie信息
        const cookies = parseCookiesFromUrl(data.url);
        const refreshToken = data.refresh_token;

        // 清理会话
        qrcodeSessions.delete(qrcodeKey);

        // 获取登录用户信息
        let userInfo = null;
        if (cookies.DedeUserID) {
          userInfo = await getUserInfo(parseInt(cookies.DedeUserID));
        }

        return {
          success: true,
          status: 'success',
          cookies,
          refreshToken,
          userInfo,
          timestamp: data.timestamp
        };
      }
      case 86038:
        // 二维码已失效
        qrcodeSessions.delete(qrcodeKey);
        return {
          success: false,
          status: 'expired',
          message: '二维码已失效'
        };
      case 86090:
        // 已扫码未确认
        return {
          success: false,
          status: 'scanned',
          message: '已扫码，请在手机上确认'
        };
      case 86101:
        // 未扫码
        return {
          success: false,
          status: 'pending',
          message: '等待扫码'
        };
      default:
        return {
          success: false,
          status: 'unknown',
          message: data.message || '未知状态'
        };
    }
  } catch (error) {
    console.error('轮询二维码状态失败:', error.message);
    return {
      success: false,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * 从B站crossDomain URL中解析Cookie
 * @param {string} url - 登录成功后返回的URL
 * @returns {Object} Cookie对象
 */
function parseCookiesFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    return {
      DedeUserID: params.get('DedeUserID') || '',
      DedeUserID__ckMd5: params.get('DedeUserID__ckMd5') || '',
      SESSDATA: params.get('SESSDATA') || '',
      bili_jct: params.get('bili_jct') || '',
      Expires: params.get('Expires') || ''
    };
  } catch (error) {
    console.error('解析Cookie URL失败:', error.message);
    return {};
  }
}

/**
 * 将Cookie对象转换为Cookie字符串
 * @param {Object} cookies - Cookie对象
 * @returns {string} Cookie字符串
 */
function cookiesToString(cookies) {
  return Object.entries(cookies)
    .filter(([key, value]) => value && key !== 'Expires')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/**
 * 验证Cookie是否有效 (通过获取用户信息)
 * @param {string} cookieString - Cookie字符串
 * @returns {Promise<Object>} 验证结果
 */
async function validateBilibiliCookie(cookieString) {
  try {
    const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieString,
        'Referer': 'https://www.bilibili.com/'
      }
    });

    if (response.data.code === 0 && response.data.data.isLogin) {
      const userData = response.data.data;
      return {
        valid: true,
        userInfo: {
          mid: userData.mid,
          uname: userData.uname,
          face: userData.face,
          level: userData.level_info?.current_level || 0
        }
      };
    }

    return {
      valid: false,
      error: '登录状态已失效'
    };
  } catch (error) {
    console.error('验证Cookie失败:', error.message);
    return {
      valid: false,
      error: error.message
    };
  }
}

module.exports = {
  getAnchorInfo,
  getRoomInfo,
  batchGetAnchorInfo,
  getUserInfo,
  batchGetUserInfo,
  clearAnchorCache,
  clearUserCache,
  clearAllCache,
  // 二维码登录相关
  generateLoginQRCode,
  pollQRCodeStatus,
  cookiesToString,
  validateBilibiliCookie
};
