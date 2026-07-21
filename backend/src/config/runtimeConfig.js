const LOCAL_CORS_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function isProduction(env = process.env) {
  return String(env.NODE_ENV || '').toLowerCase() === 'production';
}

function isPlaceholderSecret(value) {
  return /^(?:replace|change|your[_-]|development|example|secret)/i.test(String(value || '').trim());
}

function parseCorsOrigins(env = process.env) {
  const configured = String(env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return configured.length ? configured : (isProduction(env) ? [] : [...LOCAL_CORS_ORIGINS]);
}

function createCorsOptions(env = process.env) {
  const allowedOrigins = new Set(parseCorsOrigins(env));
  return {
    credentials: false,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(String(origin).replace(/\/$/, ''))) return callback(null, true);
      const error = new Error('Origin is not allowed by CORS');
      error.status = 403;
      return callback(error);
    }
  };
}

function resolveTrustProxy(env = process.env) {
  const raw = String(env.TRUST_PROXY ?? '').trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error('TRUST_PROXY must be false, true, or an integer from 0 to 10');
  }
  return hops;
}

function validateRuntimeConfig(env = process.env) {
  const errors = [];
  const jwtSecret = String(env.JWT_SECRET || '').trim();

  if (!jwtSecret) errors.push('JWT_SECRET is required');
  if (isProduction(env) && (jwtSecret.length < 32 || isPlaceholderSecret(jwtSecret))) {
    errors.push('JWT_SECRET must be a non-placeholder value of at least 32 characters in production');
  }
  if (isProduction(env) && parseCorsOrigins(env).length === 0) {
    errors.push('CORS_ORIGIN must list the public frontend origin in production');
  }

  try {
    resolveTrustProxy(env);
  } catch (error) {
    errors.push(error.message);
  }

  return errors;
}

function assertSafeRuntimeConfig(env = process.env) {
  const errors = validateRuntimeConfig(env);
  if (errors.length) throw new Error(`Unsafe runtime configuration:\n- ${errors.join('\n- ')}`);
}

module.exports = {
  LOCAL_CORS_ORIGINS,
  assertSafeRuntimeConfig,
  createCorsOptions,
  isPlaceholderSecret,
  parseCorsOrigins,
  resolveTrustProxy,
  validateRuntimeConfig
};
