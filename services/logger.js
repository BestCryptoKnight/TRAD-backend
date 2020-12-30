/*
* Module Imports
* */
const log4js = require('log4js');
const morgan = require('morgan');

let log = log4js.getLogger();
log.level = process.env.LOG_LEVEL || 'all';
let morganInstance = morgan('dev',{
	stream: {
		write: (str) => {log.debug(str)}
}
});

/**
 * Service Export
 */
module.exports = {
	log: log,
	morgan: morganInstance
};
