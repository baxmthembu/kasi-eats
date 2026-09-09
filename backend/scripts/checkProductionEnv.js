require('dotenv').config();
const { validateProductionEnv } = require('../src/config/productionReadiness');

const errors = validateProductionEnv(process.env);
if (errors.length) {
  console.error('Production configuration is not ready:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Production configuration validation passed.');
}
