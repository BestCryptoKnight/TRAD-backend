/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Task = mongoose.model('task');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  createTask,
  getDebtorList,
  aggregationQuery,
  getApplicationList,
} = require('./../helper/task.helper');
const { getClientList } = require('./../helper/client.helper');
const { getAccessBaseUserList } = require('./../helper/user.helper');
const { addAuditLog, getEntityName } = require('./../helper/audit-log.helper');
const { addNotification } = require('./../helper/notification.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.columnFor,
    );
    const taskColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        taskColumn &&
        taskColumn.columns.includes(module.manageColumns[i].name)
      ) {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        }
      } else {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        }
      }
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', data: { defaultFields, customFields } });
  } catch (e) {
    Logger.log.error('Error occurred in get task column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get User List
 */
router.get('/user-list', async function (req, res) {
  try {
    const hasFullAccess = !!(
      req.accessTypes && req.accessTypes.indexOf('full-access') !== -1
    );
    const users = await getAccessBaseUserList({
      userId: req.user._id,
      hasFullAccess: hasFullAccess,
    });
    const userIds = users.map((i) => i._id.toString());
    if (!userIds.includes(req.user._id.toString())) {
      users.push({ _id: req.user._id, name: req.user.name });
    }
    res.status(200).send({ status: 'SUCCESS', data: users });
  } catch (e) {
    Logger.log.error('Error occurred in get user list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Entity List
 */
router.get('/entity-list', async function (req, res) {
  if (!req.query.entityName) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing',
    });
  }
  try {
    let entityList;
    const hasFullAccess = !!(
      req.accessTypes && req.accessTypes.indexOf('full-access') !== -1
    );
    switch (req.query.entityName.toLowerCase()) {
      case 'user':
        entityList = await getAccessBaseUserList({
          userId: req.user._id,
          hasFullAccess: hasFullAccess,
        });
        break;
      case 'client':
        entityList = await getClientList({
          userId: req.user._id,
          hasFullAccess: hasFullAccess,
        });
        break;
      case 'debtor':
        entityList = await getDebtorList({
          userId: req.user._id,
          hasFullAccess: hasFullAccess,
          isForRisk: true,
        });
        break;
      case 'application':
        entityList = await getApplicationList({
          userId: req.user.clientId,
          hasFullAccess: hasFullAccess,
          isForRisk: true,
        });
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    res.status(200).send({ status: 'SUCCESS', data: entityList });
  } catch (e) {
    Logger.log.error('Error occurred in get entity list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Task Details
 */
router.get('/details/:taskId', async function (req, res) {
  if (
    !req.params.taskId ||
    !mongoose.Types.ObjectId.isValid(req.params.taskId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const task = await Task.findById(req.params.taskId)
      .select({ __v: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 })
      .lean();
    if (task.priority) {
      task.priority = {
        value: task.priority,
        label:
          task.priority.charAt(0).toUpperCase() +
          task.priority.slice(1).toLowerCase(),
      };
    }
    let value;
    if (task.assigneeId) {
      const user = await User.findById(task.assigneeId).lean();
      value = user.name;
      task.assigneeId = {
        label: user.name,
        value: task.assigneeId,
      };
    }
    if (task.entityId && task.entityType) {
      let response;
      if (task.entityType === 'client') {
        response = await Client.findById(task.entityId).lean();
        value = response && response.name ? response.name : '';
      } else if (task.entityType === 'application') {
        response = await Application.findById(task.entityId).lean();
        value =
          response && response.applicationId ? response.applicationId : '';
      } else if (task.entityType === 'debtor') {
        response = await Debtor.findById(task.entityId).lean();
        value = response && response.entityName ? response.entityName : '';
      }
      task.entityId = {
        value: task.entityId,
        label: value,
      };
    }
    if (task.entityType) {
      task.entityType = {
        value: task.entityType,
        label:
          task.entityType.charAt(0).toUpperCase() + task.entityType.slice(1),
      };
    }
    res.status(200).send({ status: 'SUCCESS', data: task });
  } catch (e) {
    Logger.log.error('Error occurred get task details ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Task List
 */
router.get('/', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.columnFor,
    );
    const taskColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    taskColumn.columns.push('isCompleted');
    let hasFullAccess = false;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') !== -1) {
      hasFullAccess = true;
    }
    const query = await aggregationQuery({
      taskColumn: taskColumn.columns,
      requestedQuery: req.query,
      userId: req.user._id,
      isForRisk: true,
      hasFullAccess: hasFullAccess,
    });
    const tasks = await Task.aggregate(query).allowDiskUse(true);
    const headers = [
      {
        name: 'isCompleted',
        label: 'Completed',
        type: 'boolean',
        request: { method: 'PUT', url: 'task' },
      },
    ];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (taskColumn.columns.includes(module.manageColumns[i].name)) {
        if (module.manageColumns[i].name === 'entityId') {
          module.manageColumns[i].request = {
            method: 'GET',
            user: 'user',
            client: 'client/details',
            'client-user': 'client/user-details',
            debtor: 'debtor/drawer',
            application: 'application/drawer-details',
            claim: 'claim',
            overdue: 'overdue',
          };
        }
        headers.push(module.manageColumns[i]);
      }
    }
    let response = [];
    if (tasks && tasks.length !== 0) {
      response = tasks[0]['paginatedResult']
        ? tasks[0]['paginatedResult']
        : tasks;
      response.forEach((task) => {
        if (task.entityType) {
          task.entityType =
            task.entityType.charAt(0).toUpperCase() + task.entityType.slice(1);
        }
        if (taskColumn.columns.includes('assigneeId')) {
          task.assigneeId =
            task.assigneeId && task.assigneeId.name ? task.assigneeId.name : '';
        }
        if (taskColumn.columns.includes('entityId')) {
          task.entityId =
            task.entityId && task.entityId.name && task.entityId._id
              ? {
                  _id: task.entityId._id[0],
                  value: task.entityId.name[0],
                  type: task.entityId.type,
                }
              : '';
        }
        if (taskColumn.columns.includes('createdById')) {
          task.createdById =
            task.createdById[0] && task.createdById[0].name
              ? task.createdById[0].name
              : '';
        }
      });
    }
    const total =
      tasks.length !== 0 &&
      tasks[0]['totalCount'] &&
      tasks[0]['totalCount'].length !== 0
        ? tasks[0]['totalCount'][0]['count']
        : 0;
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: response,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get task list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Add Task
 */
router.post('/', async function (req, res) {
  if (
    !req.body.taskFrom ||
    !req.body.title ||
    !req.body.assigneeId ||
    !req.body.dueDate
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const data = {
      // priority: req.body.priority.toUpperCase(),
      title: req.body.title,
      // description: req.body.description,
      // entityType: req.body.entityType ? req.body.entityType.toLowerCase() : null,
      // entityId: req.body.entityId,
      createdByType: 'user',
      createdById: req.user._id,
      assigneeType: 'user',
      assigneeId: req.body.assigneeId,
      dueDate: req.body.dueDate,
    };
    if (req.body.entityType) {
      data.entityType = req.body.entityType.toLowerCase();
    }
    if (req.body.entityId) {
      data.entityId = req.body.entityId;
    }
    if (req.body.description) {
      data.description = req.body.description;
    }
    if (req.body.priority) {
      data.priority = req.body.priority.toUpperCase();
    }
    const task = await createTask(data);
    //TODO add audit log
    let entityName;
    if ((req.body.entityType || req.body.taskFrom) && req.body.entityId) {
      entityName = await getEntityName({
        entityId: req.body.entityId,
        entityType: req.body.entityType
          ? req.body.entityType.toLowerCase()
          : req.body.taskFrom.toLowerCase(),
      });
    }
    const message =
      'A new task' +
      (entityName ? ` for ${entityName} ` : ' ') +
      `is successfully created by ${req.user.name}`;
    await addAuditLog({
      entityType: 'task',
      entityRefId: task._id,
      actionType: 'add',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: message,
    });
    if (req.body.assigneeId.toString() !== req.user._id.toString()) {
      await addNotification({
        userId: req.body.assigneeId,
        userType: 'user',
        description: message,
      });
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Task created successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in create task ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Column Names
 */
router.put('/column-name', async function (req, res) {
  if (
    !req.body.hasOwnProperty('isReset') ||
    !req.body.columns ||
    !req.body.columnFor
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let updateColumns = [];
    let module;
    switch (req.body.columnFor) {
      case 'task':
      case 'client-task':
      case 'debtor-task':
      case 'application-task':
      case 'claim-task':
      case 'overdue-task':
        if (req.body.isReset) {
          module = StaticFile.modules.find(
            (i) => i.name === req.body.columnFor,
          );
          updateColumns = module.defaultColumns;
        } else {
          updateColumns = req.body.columns;
        }
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': req.body.columnFor },
      { $set: { 'manageColumns.$.columns': updateColumns } },
    );
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Columns updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in update column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Task
 */
router.put('/:taskId', async function (req, res) {
  if (
    !req.params.taskId ||
    !mongoose.Types.ObjectId.isValid(req.params.taskId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let updateObj = {};
    if (req.body.title) updateObj.title = req.body.title;
    if (req.body.description) updateObj.description = req.body.description;
    if (req.body.priority) updateObj.priority = req.body.priority.toUpperCase();
    if (req.body.entityType)
      updateObj.entityType = req.body.entityType.toLowerCase();
    if (req.body.entityId) updateObj.entityId = req.body.entityId;
    if (req.body.assigneeId) updateObj.assigneeId = req.body.assigneeId;
    if (req.body.dueDate) updateObj.dueDate = req.body.dueDate;
    if (req.body.hasOwnProperty('isCompleted')) {
      updateObj.isCompleted = req.body.isCompleted;
      updateObj.completedDate = req.body.isCompleted ? new Date() : undefined;
    }
    await Task.updateOne({ _id: req.params.taskId }, updateObj);
    const task = await Task.findById(req.params.taskId).lean();
    let entityName;
    if (task.entityType && task.entityId) {
      entityName = await getEntityName({
        entityId: task.entityId,
        entityType: task.entityType.toLowerCase(),
      });
    }
    const message =
      'A task' +
      (entityName ? ` for ${entityName} ` : ' ') +
      `is successfully updated by ${req.user.name}`;
    await addAuditLog({
      entityType: 'task',
      entityRefId: task._id,
      actionType: 'edit',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: message,
    });
    if (req.body.assigneeId.toString() !== req.user._id.toString()) {
      await addNotification({
        userId: req.body.assigneeId,
        userType: 'user',
        description: message,
      });
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Task updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in update task', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Task
 */
router.delete('/:taskId', async function (req, res) {
  if (
    !req.params.taskId ||
    !mongoose.Types.ObjectId.isValid(req.params.taskId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    await Task.updateOne({ _id: req.params.taskId }, { isDeleted: true });
    const task = await Task.findById(req.params.taskId).lean();
    let entityName;
    if (task.entityType && task.entityId) {
      entityName = await getEntityName({
        entityId: task.entityId,
        entityType: task.entityType.toLowerCase(),
      });
    }
    await addAuditLog({
      entityType: 'task',
      entityRefId: task._id,
      actionType: 'delete',
      userType: 'user',
      userRefId: req.user._id,
      logDescription:
        `A task` + entityName
          ? `for ${entityName} `
          : ' ' + `is successfully updated by ${req.user.name}`,
    });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Task deleted successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in delete task ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Export Router
 */
module.exports = router;
