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
const { getNotificationList } = require('./../helper/notification.helper');

/**
 * Get Notification list
 */
router.get('/', async function (req, res) {
  try {
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;
    req.query.page = req.query.page || 1;
    req.query.limit = 15;
    let query = [
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
          entityId: '$entityId',
          entityType: '$entityType',
        },
      },
    ];
    if (month && year) {
      query.push({ $match: { month: month, year: year } });
    }
    query = [
      ...query,
      { $sort: { createdAt: -1 } },
      {
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
      },
    ];

    const { notifications, total } = await getNotificationList({ query });
    const response = {};
    notifications.forEach((data) => {
      if (!response[data.year + '-' + data.month + '-' + data.day]) {
        response[data.year + '-' + data.month + '-' + data.day] = [];
      }
      response[data.year + '-' + data.month + '-' + data.day].push({
        _id: data._id,
        description: data.description,
        createdAt: data.createdAt,
        entityId: data.entityId,
        entityType: data.entityType,
        hasSubmodule: data.hasSubModule,
        subModule: data.subModule,
      });
    });
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
    req.query.page = req.query.page ? parseInt(req.query.page, 10) : 1;
    req.query.limit = req.query.limit ? parseInt(req.query.limit, 10) : 15;
    const query = [
      {
        $match: {
          isDeleted: false,
          userId: req.user._id,
          isRead: false,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $facet: {
          paginatedResult: [
            {
              $skip: (req.query.page - 1) * req.query.limit,
            },
            {
              $limit: req.query.limit,
            },
            {
              $addFields: {
                alertId: {
                  $cond: [
                    {
                      $eq: ['$entityType', 'alert'],
                    },
                    '$entityId',
                    null,
                  ],
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
            {
              $unwind: {
                path: '$alertId',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                entityId: {
                  $cond: [
                    {
                      $eq: ['$entityType', 'alert'],
                    },
                    {
                      priority: '$alertId.alertPriority',
                      _id: '$alertId._id',
                    },
                    '$entityId',
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
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ];
    const { notifications, total } = await getNotificationList({ query });
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: notifications,
        total,
        page: req.query.page,
        limit: req.query.limit,
        pages: Math.ceil(total / req.query.limit),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get unread notification list', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Mark all unread notifications as read
 */
router.get('/markAllAsRead', async function (req, res) {
  try {
    await Notification.updateMany(
      { isDeleted: false, userId: req.user._id, isRead: false },
      { isRead: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Notifications marked as read',
    });
  } catch (e) {
    Logger.log.error('Error occurred in mark all as read', e);
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
