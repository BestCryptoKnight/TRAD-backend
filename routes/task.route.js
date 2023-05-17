/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');
const Task = mongoose.model('task');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  aggregationQuery,
  getApplicationList,
} = require('./../helper/task.helper');
const { getUserClientList } = require('./../helper/client.helper');
const { addAuditLog, getEntityName } = require('./../helper/audit-log.helper');
const { sendNotification } = require('./../helper/socket.helper');
const { addNotification } = require('./../helper/notification.helper');
const { getCurrentDebtorList } = require('./../helper/debtor.helper');
const { generateExcel } = require('./../helper/excel.helper');

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
    const users = await getUserClientList({
      clientId: req.user.clientId,
      isForAssignee: true,
    });
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
    switch (req.query.entityName.toLowerCase()) {
      case 'client-user':
        entityList = await getUserClientList({
          clientId: req.user.clientId,
          isForAssignee: false,
        });
        break;
      case 'debtor':
        entityList = await getCurrentDebtorList({
          userId: req.user.clientId,
          hasFullAccess: false,
          isForRisk: false,
          limit: req.query.limit,
          page: req.query.page,
          showCompleteList: false,
          isForOverdue: false,
        });
        break;
      case 'application':
        entityList = await getApplicationList({
          userId: req.user.clientId,
          hasFullAccess: false,
          isForRisk: false,
          page: req.query.page,
          limit: req.query.limit,
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
      if (task.assigneeType === 'user') {
        const user = await User.findById(task.assigneeId).lean();
        value = user.name;
      } else {
        const user = await ClientUser.findOne({ clientId: task.assigneeId })
          .populate({ path: 'clientId', select: '_id name' })
          .lean();
        value =
          user && user.clientId && user.clientId.name ? user.clientId.name : '';
      }
      task.assigneeId = {
        label: value,
        value: task.assigneeId,
      };
    }
    if (task.entityId && task.entityType) {
      let response;
      if (task.entityType === 'client') {
        response = await Client.findById(task.entityId).lean();
        value = response.name;
      } else if (task.entityType === 'application') {
        response = await Application.findById(task.entityId).lean();
        value = response.applicationId;
      } else if (task.entityType === 'debtor') {
        response = await Debtor.findById(task.entityId).lean();
        value = response.entityName;
      } else if (task.entityType === 'user') {
        response = await User.findById(task.entityId).lean();
        value = response.name;
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
 * Download Excel
 */
router.get('/download', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'task');
    const taskColumn = [
      'priority',
      'description',
      'comments',
      'entityType',
      'entityId',
      'createdById',
      'assigneeId',
      'dueDate',
      'createdAt',
      'updatedAt',
    ];
    const hasFullAccess =
      req.accessTypes && req.accessTypes.indexOf('full-access') !== -1;
    const { query, filterArray } = await aggregationQuery({
      taskColumn,
      isForDownload: true,
      requestedQuery: req.query,
      isForRisk: false,
      hasFullAccess,
      userId: req.user.clientId,
    });
    const taskList = await Task.aggregate(query).allowDiskUse(true);
    const tasks =
      taskList && taskList[0] && taskList[0]['paginatedResult']
        ? taskList[0]['paginatedResult']
        : taskList;
    const finalArray = [];
    let data = {};
    if (tasks && tasks.length > 20000) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOWNLOAD_LIMIT_EXCEED',
        message:
          'User cannot download more than 20000 applications at a time. Please apply filter to narrow down the list',
      });
    }
    if (tasks.length !== 0) {
      tasks.forEach((i) => {
        data = {};
        taskColumn.map((key) => {
          if (key === 'entityId' || key === 'assigneeId') {
            i[key] = i[key] && i[key]['name']?.[0] ? i[key]['name'][0] : '-';
          }
          if (key === 'createdById') {
            i[key] = i[key]?.[0] || '-';
          }
          data[key] = i[key];
        });
        finalArray.push(data);
      });
    }
    const excelData = await generateExcel({
      data: finalArray,
      reportFor: 'Task List',
      headers: module.manageColumns,
      filter: filterArray,
    });
    const fileName = 'task-list-' + new Date().getTime() + '.xlsx';
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
    res.status(200).send(excelData);
  } catch (e) {
    Logger.log.error('Error occurred in download task list', e);
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
    const entityType = req.query.columnFor.split('-').shift();

    /* if (req.query.columnFor === 'task') {
      req.query.requestedEntityId = req.user.clientId;
    }*/
    taskColumn.columns.push('isCompleted');
    const { query } = await aggregationQuery({
      taskColumn: taskColumn.columns,
      requestedQuery: req.query,
      isForRisk: false,
      hasFullAccess: false,
      userId: req.user.clientId,
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
          //TODO change url
          module.manageColumns[i].request = {
            method: 'GET',
            client: 'client/details',
            'client-user': 'client/user-details',
            debtor: 'debtor/drawer',
            application: 'application/drawer-details',
            insurer: 'insurer',
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
            task.assigneeId && task.assigneeId.name && task.assigneeId.name[0]
              ? task.assigneeId.name[0]
              : '';
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
            task.createdById && task.createdById[0] ? task.createdById[0] : '';
        }
      });
    }
    const total =
      tasks.length !== 0 &&
      tasks[0]['totalCount'] &&
      tasks[0]['totalCount'].length !== 0
        ? tasks[0]['totalCount'][0]['count']
        : 0;

    const selectedEntityDetails = {};
    if (entityType && req.query.requestedEntityId) {
      selectedEntityDetails.label = await getEntityName({
        entityType,
        entityId: req.query.requestedEntityId,
      });
      selectedEntityDetails.value = req.query.requestedEntityId;
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: response,
        headers,
        total,
        selectedEntityDetails,
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
    await ClientUser.updateOne(
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
    if (req.body.description) updateObj.description = req.body.description;
    if (req.body.comments) updateObj.comments = req.body.comments;
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
    const clientName = await getEntityName({
      entityId: req.user.clientId,
      entityType: 'client',
    });
    await addAuditLog({
      entityType: 'task',
      entityRefId: task._id,
      actionType: 'edit',
      userType: 'client-user',
      userRefId: req.user.clientId,
      logDescription:
        'A task' +
        (entityName ? ` for ${entityName} ` : ' ') +
        `is successfully updated by ${clientName}`,
    });
    if (task.createdById.toString() !== req.user.clientId.toString()) {
      const notification = await addNotification({
        userId: task.createdById,
        userType: task.createdByType,
        description:
          `A task ${task.description}` +
          (entityName ? ` for ${entityName} ` : ' ') +
          `is updated by ${clientName}`,
        entityType: 'task',
        entityId: task._id,
      });
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'TASK_UPDATED',
            data: notification,
          },
          type: task.createdByType,
          userId: task.createdById,
        });
      }
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
