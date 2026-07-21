const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export const resolveSiteAssetUrl = (value) => {
  if (!value) return '';
  return value.startsWith('/uploads/') ? `${API_ORIGIN}${value}` : value;
};
