/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const noteSchema = new Schema(
    {
        noteFor: {type: Schema.Types.String, enum: ['client', 'debtor', 'application','claim','overdue']},
        entityId: {type: Schema.Types.ObjectId},
        description: {type: Schema.Types.String},
        isDeleted: {type: Schema.Types.Boolean, default: false},
        isPublic: {type: Schema.Types.Boolean, default: false},
        createdByType : {type:Schema.Types.String, enum: ['client-user','user']},
        createdById: {type:Schema.Types.ObjectId}
    },
    {timestamps: true},
);

noteSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('note', noteSchema);
