/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const Notification = mongoose.model('notification');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { getAlertDetail } = require('./../helper/alert.helper');

/**
 * Get Notification list
 */
router.get('/', async function (req, res) {
  try {
    const month = req.query.month
      ? parseInt(req.query.month)
      : new Date().getMonth() + 1;
    const year = req.query.year
      ? parseInt(req.query.year)
      : new Date().getFullYear();
    req.query.page = req.query.page || 1;
    req.query.limit = 15;
    const query = [
      {
        $match: {
          isDeleted: false,
          userId: mongoose.Types.ObjectId(req.user._id),
        },
      },
      {
        $project: {
          day: { $dayOfMonth: '$createdAt' },
          month: { $month: '$createdAt' },
          year: { $year: '$createdAt' },
          description: '$description',
          createdAt: '$createdAt',
        },
      },
      { $match: { month: month, year: year } },
    ];
    query.push({ $sort: { createdAt: -1 } });
    query.push({
      $facet: {
        paginatedResult: [
          {
            $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
          },
          { $limit: parseInt(req.query.limit) },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    });
    const notifications = await Notification.aggregate(query).allowDiskUse(
      true,
    );
    const response = {};
    notifications[0].paginatedResult.forEach((data) => {
      if (!response[data.year + '-' + data.month + '-' + data.day]) {
        response[data.year + '-' + data.month + '-' + data.day] = [];
      }
      response[data.year + '-' + data.month + '-' + data.day].push({
        _id: data._id,
        description: data.description,
        createdAt: data.createdAt,
      });
    });
    const total =
      notifications[0]['totalCount'].length !== 0
        ? notifications[0]['totalCount'][0]['count']
        : 0;
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: response,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get notification list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get unread notification list
 */
router.get('/list', async function (req, res) {
  try {
    const notifications = await Notification.aggregate([
      {
        $match: {
          isDeleted: false,
          userId: req.user._id,
          isRead: false,
        },
      },
      {
        $addFields: {
          alertId: {
            $cond: [{ $eq: ['$entityType', 'alert'] }, '$entityId', null],
          },
        },
      },
      {
        $lookup: {
          from: 'alerts',
          localField: 'alertId',
          foreignField: '_id',
          as: 'alertId',
        },
      },
      { $unwind: { path: '$alertId', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          entityId: {
            $cond: [
              { $eq: ['$entityType', 'alert'] },
              {
                priority: '$alertId.alertPriority',
                _id: '$alertId._id',
              },
              null,
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          description: 1,
          createdAt: 1,
          entityType: 1,
          entityId: 1,
        },
      },
    ]).allowDiskUse(true);
    res.status(200).send({
      status: 'SUCCESS',
      data: notifications,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get notification list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Alert Detail
 */
router.get('/alert/:alertId', async function (req, res) {
  if (
    !req.params.alertId ||
    !mongoose.Types.ObjectId.isValid(req.params.alertId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const response = await getAlertDetail({ alertId: req.params.alertId });
    if (response && response.status && response.status === 'ERROR') {
      return res.status(400).send(response);
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get alert list', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update notification status
 */
router.put('/markAsRead/:notificationId', async function (req, res) {
  if (
    !req.params.notificationId ||
    !mongoose.Types.ObjectId.isValid(req.params.notificationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await Notification.updateOne(
      { _id: req.params.notificationId },
      { isRead: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Notification marked as read',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in mark notification as read',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Notification
 */
router.delete('/:notificationId', async function (req, res) {
  if (
    !req.params.notificationId ||
    !mongoose.Types.ObjectId.isValid(req.params.notificationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await Notification.updateOne(
      { _id: req.params.notificationId },
      { isDeleted: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Notification deleted successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete notification', e.message || e);
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
