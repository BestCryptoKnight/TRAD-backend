/*
 * Module Imports
 * */
const log4js = require('log4js');
const morgan = require('morgan');

/*
 * Local Imports
 * */
const config = require('../config');

/**
 * Declarations & Implementations
 */
const configuration = {
  appenders: {
    out: { type: 'stdout' },
    allLogs: {
      type: 'file',
      filename: 'all.log',
      maxLogSize: 10485760,
      backups: 10,
      compress: true,
    },
    outFilter: {
      type: 'logLevelFilter',
      appender: 'out',
      level: config.server.logLevel || 'all',
    },
    teamsAlert: {
      type: '@kevit/log4js-teams',
      webhookUrl: config.server.webhookUrl,
    },
    teamsFilter: {
      type: 'logLevelFilter',
      appender: 'teamsAlert',
      level: config.server.alertLogLevel || 'warn',
    },
  },
  categories: {
    default: { appenders: ['allLogs', 'outFilter'], level: 'all' },
  },
};
if (config.server.webhookUrl) {
  configuration.categories.default.appenders.push('teamsFilter');
}
log4js.configure(configuration);

let log = log4js.getLogger();
log.level = config.server.logLevel || 'all';
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
