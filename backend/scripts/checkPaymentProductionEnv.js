require('dotenv').config();
const {
  validatePaymentProductionEnv,
} = require('../src/config/paymentProductionReadiness');

const errors = validatePaymentProductionEnv(process.env);
if (errors.length) {
  console.error('Payment production readiness failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Payment production environment is ready.');
}
