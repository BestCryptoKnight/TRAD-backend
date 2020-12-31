/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const clientUserSchema = new Schema(
    {
        clientId: {type: Schema.Types.ObjectId, ref: 'client'},
        crmContactIdId: {type: Schema.Types.String, unique: true},
        email: {
            type: Schema.Types.String,
            unique: true
        },
        password: Schema.Types.String,
        signUpToken: Schema.Types.String,
        profilePicture: Schema.Types.String,
        jwtToken: [Schema.Types.String],
        isDeleted: {type: Schema.Types.Boolean, default: false},
        hasPortalAccess: {type: Schema.Types.Boolean},
        hasLeftCompany: {type: Schema.Types.Boolean},
        isDecisionMaker: {type: Schema.Types.Boolean},

    },
    {timestamps: true},
);

clientUserSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('client-user', clientUserSchema);
