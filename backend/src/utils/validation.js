class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

function stringValue(value, { field = 'Value', required = false, max = 500, trim = true } = {}) {
  const text = String(value ?? '');
  const normalized = trim ? text.trim() : text;
  if (required && !normalized) throw new ValidationError(`${field} is required`);
  if (normalized.length > max) throw new ValidationError(`${field} must not exceed ${max} characters`);
  return normalized;
}

function positiveInt(value, { field = 'Value', min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${field} must be an integer from ${min} to ${max}`);
  }
  return number;
}

function idList(value, { field = 'IDs', max = 100 } = {}) {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError(`${field} are required`);
  if (value.length > max) throw new ValidationError(`${field} must contain at most ${max} items`);
  return [...new Set(value.map((item) => positiveInt(item, { field: `${field} item` })))];
}

module.exports = { ValidationError, idList, positiveInt, stringValue };
