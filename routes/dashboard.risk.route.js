/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const Task = mongoose.model('task');
const Client = mongoose.model('client');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { getAccessBaseUserList } = require('./../helper/user.helper');

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
 * Get pending application + task count
 */
router.get('/', async function (req, res) {
  try {
    const users =
      req.query.users && req.query.users.length !== 0
        ? req.query.users.split(',')
        : [req.user._id];
    const clients = await Client.find({
      isDeleted: false,
      $or: [
        { riskAnalystId: { $in: users } },
        { serviceManagerId: { $in: users } },
      ],
    }).lean();
    const clientIds = clients.map((i) => i._id);
    const [applications, tasks] = await Promise.all([
      Application.countDocuments({
        isDeleted: false,
        clientId: { $in: clientIds },
        status: {
          $in: [
            'SENT_TO_INSURER',
            'REVIEW_APPLICATION',
            'PENDING_INSURER_REVIEW',
            'SUBMITTED',
            'UNDER_REVIEW',
            'AWAITING_INFORMATION',
          ],
        },
      }).exec(),
      Task.countDocuments({
        assigneeId: { $in: users },
        isCompleted: false,
        isDeleted: false,
      }).exec(),
    ]);
    res.status(200).send({ status: 'SUCCESS', data: { applications, tasks } });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get risk dashboard data',
      e.message || e,
    );
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
