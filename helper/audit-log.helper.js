/*
* Module Imports
* */
const mongoose = require('mongoose');
const AuditLog = mongoose.model('audit-log');

/*
* Local Imports
* */
const Logger = require('./../services/logger');

let addAuditLog = async ({entityType, entityRefId, userType, userRefId, actionType, logDescription}) => {
    try {
        await AuditLog.create({entityType, entityRefId, userType, userRefId, actionType, logDescription});
        Logger.log.info('Audit log added');
    } catch (e) {
        Logger.log.error(`Error occurred in add audit log `, e.message || e);
    }
};

module.exports = {addAuditLog};
