const log4js = require('log4js');
const morgan = require('morgan');
/**
 * Config
 * */
const Config = require('../config');

/**
 * Declarations & Implementations
 */

let log = log4js.getLogger();
log.level = Config.server.logLevel || 'all';
let morganInstance = morgan('dev', {
    stream: {
        write: (str) => {
            log.debug(str);
        },
    },
});
/**
 * Service Export
 */
module.exports = {
    log: log,
    morgan: morganInstance,
};
