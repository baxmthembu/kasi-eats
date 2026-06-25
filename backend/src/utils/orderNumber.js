/**
 * Human-readable order numbers for vendors and customers
 */
const generateOrderNumber = () => {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KE-${yy}${mm}${dd}-${rand}`;
};

module.exports = { generateOrderNumber };
