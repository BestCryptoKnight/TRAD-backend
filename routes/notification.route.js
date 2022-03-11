/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notification = mongoose.model('notification');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { getNotificationList } = require('./../helper/notification.helper');

/**
 * Get Notification list
 */
router.get('/', async function (req, res) {
  try {
    req.query.page = req.query.page || 1;
    req.query.limit = 15;
    const query = [
      {
        $match: {
          isDeleted: false,
          userId: mongoose.Types.ObjectId(req.user.clientId),
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
          userId: req.user.clientId,
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
    Logger.log.error('Error occurred in get notification list ', e);
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
      { isDeleted: false, userId: req.user.clientId, isRead: false },
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
