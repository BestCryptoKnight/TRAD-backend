/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Note = mongoose.model('note');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { addAuditLog, getEntityName } = require('./audit-log.helper');

const addNote = async ({
  userType,
  userId,
  description,
  noteFor,
  entityId,
  isPublic = false,
  userName,
}) => {
  try {
    const note = new Note({
      noteFor: noteFor,
      entityId: entityId,
      description: description,
      isPublic: isPublic,
      createdByType: userType,
      createdById: userId,
    });
    await note.save();
    const entityName = await getEntityName({
      entityId: entityId,
      entityType: noteFor.toLowerCase(),
    });
    await addAuditLog({
      entityType: 'note',
      entityRefId: note._id,
      actionType: 'add',
      userType: userType,
      userRefId: userId,
      logDescription: `A new note for ${entityName} is successfully created by ${userName}`,
    });
    return note;
  } catch (e) {
    Logger.log.error(`Error occurred in add note `, e.message || e);
  }
};

module.exports = { addNote };
