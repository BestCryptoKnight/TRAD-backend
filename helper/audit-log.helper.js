/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const AuditLog = mongoose.model('audit-log');
const Application = mongoose.model('application');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const addAuditLog = async ({
  entityType,
  entityRefId,
  userType,
  userRefId,
  actionType,
  logDescription,
}) => {
  try {
    await AuditLog.create({
      entityType,
      entityRefId,
      userType,
      userRefId,
      actionType,
      logDescription,
    });
    Logger.log.info('Audit log added');
  } catch (e) {
    Logger.log.error(`Error occurred in add audit log `, e.message || e);
  }
};

const getAuditLogs = async ({ entityId }) => {
  try {
    const logs = await AuditLog.find({ entityRefId: entityId })
      .select('_id logDescription createdAt')
      .lean();
    return logs;
  } catch (e) {
    Logger.log.error('Error occurred in get audit log list ', e.message || e);
  }
};

const getEntityName = async ({ entityType, entityId }) => {
  try {
    let response;
    let entity;
    switch (entityType) {
      case 'application':
        entity = await Application.findById(entityId).lean();
        response = entity.applicationId;
        break;
      case 'claim':
        break;
      case 'client':
        entity = await Client.findById(entityId).lean();
        response = entity.name;
        break;
      case 'debtor':
        entity = await Debtor.findById(entityId).lean();
        response = entity.entityName;
        break;
      case 'overdue':
        break;
      case 'user':
        entity = await User.findById(entityId).lean();
        response = entity.name;
        break;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get entity name ', e.message || e);
  }
};

module.exports = { addAuditLog, getAuditLogs, getEntityName };
