'use strict';
/** CJS bridge so Next/webpack can't stub the native `@libsql/client` require. */
module.exports = require('@libsql/client');
