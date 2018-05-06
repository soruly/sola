const dotenv = require('dotenv');

dotenv.config();

/**
 * Gets a string environment variable by the given name.
 *
 * @param  {String} name - The name of the environment variable.
 * @param  {String} defaultVal - The default value to use.
 *
 * @return {String} The value.
 */
const string = function string(name, defaultVal) {
  return process.env[name] || defaultVal;
}

/**
 * Gets a number environment variable by the given name.
 *
 * @param  {String} name - The name of the environment variable.
 * @param  {number} defaultVal - The default value to use.
 *
 * @return {number} The value.
 */
const number = function number(name, defaultVal) {
  return process.env[name] ? parseInt(process.env[name], 10) : defaultVal;
}

const bool = function bool(name, defaultVal) {
  return process.env[name] ? process.env[name] === 'true' || process.env[name] === '1' : defaultVal;
}

module.exports = { string, number, bool };
