const CAPTCHA_KEYS = [
  'ALIYUN_ACCESS_KEY_ID',
  'ALIYUN_ACCESS_KEY_SECRET',
  'ALIYUN_CAPTCHA_SCENE_ID',
  'ALIYUN_CAPTCHA_PREFIX'
];

const SES_BASE_KEYS = [
  'TENCENT_SECRET_ID',
  'TENCENT_SECRET_KEY',
  'SES_FROM_EMAIL'
];

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAll(env, keys) {
  return keys.every((key) => hasText(env[key]));
}

function hasTemplateId(value) {
  return hasText(value) && /^\d+$/.test(value.trim()) && Number(value) > 0;
}

function isCaptchaEnabled(env = process.env) {
  return hasAll(env, CAPTCHA_KEYS);
}

function isSesBaseConfigured(env = process.env) {
  return hasAll(env, SES_BASE_KEYS);
}

function isEmailVerificationEnabled(env = process.env) {
  return isSesBaseConfigured(env) && hasTemplateId(env.SES_TEMPLATE_ID);
}

function isRedemptionEmailEnabled(env = process.env) {
  return isSesBaseConfigured(env) &&
    hasTemplateId(env.SES_REDEMPTION_TEMPLATE_ID) &&
    hasText(env.SES_REDEMPTION_TO_EMAIL);
}

function isMarshmallowEmailEnabled(env = process.env) {
  return isSesBaseConfigured(env) &&
    hasTemplateId(env.SES_MARSHMALLOW_TEMPLATE_ID) &&
    hasText(env.SES_MARSHMALLOW_TO_EMAIL);
}

module.exports = {
  CAPTCHA_KEYS,
  SES_BASE_KEYS,
  hasAll,
  hasTemplateId,
  isCaptchaEnabled,
  isEmailVerificationEnabled,
  isRedemptionEmailEnabled,
  isMarshmallowEmailEnabled
};
