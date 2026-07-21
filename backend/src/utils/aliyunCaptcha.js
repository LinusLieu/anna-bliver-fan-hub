/**
 * 阿里云验证码2.0服务端验证工具
 * 用于验证前端传来的 captchaVerifyParam 参数
 */

const Captcha20230305 = require('@alicloud/captcha20230305');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');
const { isCaptchaEnabled } = require('./optionalFeatures');

// 创建客户端
function createClient() {
  const config = new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  });
  // 根据区域设置 endpoint
  // 中国内地：captcha.cn-shanghai.aliyuncs.com
  // 非中国内地（新加坡）：captcha.ap-southeast-1.aliyuncs.com
  config.endpoint = 'captcha.cn-shanghai.aliyuncs.com';
  return new Captcha20230305.default(config);
}

/**
 * 验证阿里云验证码
 * @param {string} captchaVerifyParam - 前端验证码验证参数（由验证码JS自动生成）
 * @param {string} sceneId - 可选，服务端传入的场景ID，防止前端被篡改
 * @returns {Promise<{success: boolean, code: string, message: string}>}
 */
async function verifyCaptcha(captchaVerifyParam, sceneId = null) {
  // 任一必需配置缺失时，整个验证码功能视为未启用。
  if (!isCaptchaEnabled()) {
    console.warn('[Captcha] 阿里云验证码未配置，跳过验证');
    return { success: true, code: 'SKIP', message: '验证码未配置，已跳过' };
  }

  if (!captchaVerifyParam) {
    return { success: false, code: 'F002', message: '验证参数为空' };
  }

  try {
    const client = createClient();

    const verifyRequest = new Captcha20230305.VerifyIntelligentCaptchaRequest({
      captchaVerifyParam: captchaVerifyParam,
    });

    // 如果传入了 sceneId，添加到请求中进行双重验证
    if (sceneId) {
      verifyRequest.sceneId = sceneId;
    }

    const runtime = new Util.RuntimeOptions({});
    const response = await client.verifyIntelligentCaptchaWithOptions(verifyRequest, runtime);

    if (response.body.success && response.body.result?.verifyResult) {
      return {
        success: true,
        code: response.body.result.verifyCode || 'T001',
        message: '验证通过',
        certifyId: response.body.result.certifyId
      };
    } else {
      const verifyCode = response.body.result?.verifyCode || 'UNKNOWN';
      const errorMessages = {
        'F001': '疑似攻击请求，风险策略不通过',
        'F002': '验证参数为空',
        'F003': '验证参数格式不合法',
        'F004': '测试模式配置为验证不通过',
        'F005': '场景ID不合法',
        'F006': '场景ID不存在',
        'F008': '验证数据重复提交',
        'F009': '检测到虚拟设备环境',
        'F010': '同IP访问频率超出限制',
        'F011': '同设备访问频率超出限制',
        'F012': '服务端场景ID与前端不一致',
        'F013': '验证参数缺少必要字段',
        'F014': '无初始化记录或已过期',
        'F015': '验证交互不通过（如拼图位置错误）',
        'F016': 'URL验证策略不通过',
        'F017': '疑似攻击请求，协议或参数异常',
        'F018': 'V3架构验证参数重复使用',
        'F019': 'V3架构验证请求超时',
        'F020': 'V3架构验证参数与场景不匹配',
        'F023': 'V2架构初始化失败的容灾验证',
        'F024': '检测到自动化脚本模拟点击'
      };

      return {
        success: false,
        code: verifyCode,
        message: errorMessages[verifyCode] || '验证失败'
      };
    }
  } catch (error) {
    console.error('[Captcha] 验证码服务调用失败:', error);

    // 处理特定错误
    if (error.code === 'Forbidden.AccountAccessDenied') {
      return { success: false, code: 'ERROR', message: '验证码服务未开通或已欠费' };
    }
    if (error.code === 'Forbidden.RAMUserAccessDenied') {
      return { success: false, code: 'ERROR', message: 'RAM用户无权限' };
    }

    // 容灾处理：如果验证码服务不可用，可以选择放行或拒绝
    // 这里选择拒绝，生产环境可根据业务需求调整
    return { success: false, code: 'ERROR', message: '验证码服务暂时不可用，请稍后重试' };
  }
}

module.exports = {
  verifyCaptcha
};
