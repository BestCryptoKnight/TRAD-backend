/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');

/*
* Local Imports
* */
const config = require('../config');
const MailHelper = require('./../helper/mailer.helper');
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {addAuditLog} = require('./../helper/audit-log.helper');

const uploadProfilePath = path.resolve(__dirname, '../upload/' + getProfileImagePath());
// Custom Multer storage engine
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadProfilePath);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + '-' + file.originalname);
    },
});
const upload = multer({dest: uploadProfilePath, storage: storage});

/**
 * Upload for profile-picture of User.
 */
router.post('/upload/profile-picture', upload.single('profile-picture'), async (req, res) => {
    let userId = req.user._id;
    if (!userId) {
        Logger.log.error('User id not found in the logged in user');
        return res.status(400).send({
            status: 'ERROR',
            messageCode:'USER_NOT_FOUND',
            message: 'User not found, please try by logging in again.',
        });
    }
    try {
        await User.findByIdAndUpdate(userId, {profilePicture: req.file.filename}, {new: true});
        res.status(200).send({status: 'success', data: getProfileUrl(getProfileUrl(req.file.filename))});
        if (req.query.oldImageName) {
            Logger.log.info('Old image name:', req.query.oldImageName);
            let imagePath = path.resolve(__dirname + '/../upload/' + getProfileImagePath() + req.query.oldImageName);
            fs.unlink(imagePath, (err) => {
                if (err) {
                    Logger.log.warn(
                        `Error deleting profile picture with name: ${req.query.oldImageName} by user ${req.user._id}`,
                    );
                    Logger.log.warn(err.message || err);
                } else Logger.log.info('Successfully deleted old profile picture.');
            });
        }
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Remove profile-picture of User.
 */
router.delete('/profile-picture', async (req, res) => {
    let userId = req.user._id;
    if (!userId) {
        Logger.log.error('User id not found in the logged in user');
        return res.status(400).send({
            status: 'ERROR',
            messageCode:'USER_NOT_FOUND',
            message: 'User not found, please try by logging in again.',
        });
    }
    if (!req.query.oldImageName) {
        Logger.log.error('In delete profile picture call, old image name not present for the user:', userId);
        return res.status(400).send({
            status: 'ERROR',
            messageCode:'IMAGE_NOT_FOUND',
            message: 'Image name not found, unable to remove old profile picture.',
        });
    }
    Logger.log.info('Old image name:', req.query.oldImageName);
    let imagePath = path.resolve(__dirname + '/../upload/' + getProfileImagePath() + req.query.oldImageName);
    fs.unlink(imagePath, async (err) => {
        if (err) {
            Logger.log.warn(
                `Error deleting profile picture with name: ${req.query.oldImageName} by user ${req.user._id}`,
            );
            Logger.log.warn(err.message || err);
            return res.status(500).send({status: 'ERROR', message: 'Error removing profile picture.'});
        } else {
            Logger.log.info('Successfully deleted old profile picture.');
            await User.findByIdAndUpdate(userId, {profilePicture: null}, {new: true})
            res.status(200).send({status: 'SUCCESS', message: 'Profile Picture deleted successfully.'});
        }
    });
});

/**
 * Gets the Profile
 */
router.get('/profile', async function (req, res) {
    Logger.log.info('In get profile call');
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', messageCode:'UNAUTHORIZED', message: 'Please first login to update the profile.'});
    }
    try {
        let userData = await User.findById(req.user._id)
            .select({name: 1, role: 1, email: 1, contactNumber: 1, profilePicture: 1});
        userData.profilePicture = getProfileUrl(userData.profilePicture);
        Logger.log.info('Fetched user details');
        res.status(200).send({status: 'SUCCESS', data: userData});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Gets the List of Module Access
 */
router.get('/module-access', async function (req, res) {
    Logger.log.info('In get privileges call');
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', messageCode:'UNAUTHORIZED',message: 'Please first login to update the profile.'});
    }
    try {
        let userData = await User.findById(req.user._id)
            .select({moduleAccess: 1});
        res.status(200).send({status: 'SUCCESS', data: userData});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Column Names
 */
router.get('/column-name',async function (req,res) {
   try {
       const module = StaticFile.modules.find(i => i.name === 'user');
       const userColumn = req.user.manageColumns.find(i => i.moduleName === 'user');
       let customFields = [];
       let defaultFields = [];
       for (let i = 0; i < module.manageColumns.length; i++) {
           if(userColumn.columns.includes(module.manageColumns[i].name)){
               if(module.defaultColumns.includes(module.manageColumns[i].name)){
                   defaultFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:true});
               } else {
                   customFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:true});
               }
           } else {
               if(module.defaultColumns.includes(module.manageColumns[i].name)){
                   defaultFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:false});
               } else {
                   customFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:false});
               }
           }
       }
       res.status(200).send({status: 'SUCCESS', data: {defaultFields,customFields}});
   } catch (e) {
       Logger.log.error('Error occurred in get column names', e.message || e);
       res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
   }
});

/**
 * Filter User List
 */
router.get('/filter',async function (req,res) {
   try {
       const module = StaticFile.modules.find(i => i.name === 'user');
       const userColumn = req.user.manageColumns.find(i => i.moduleName === 'user');
       const queryFilter = {
           isDeleted: false
       };
       if (req.query.role){
           queryFilter.role = req.query.role
       }
       if (req.query.startDate && req.query.endDate){
           queryFilter.createdAt={$gte:req.query.startDate ,$lt:req.query.endDate}
       }
       const option = {
           page: parseInt(req.query.page) || 1,
           limit: parseInt(req.query.limit) || 5,
       };
       option.select = userColumn.columns.toString().replace(/,/g, ' ')+ ' signUpToken';
       option.lean = true;
       const responseData= await User.paginate(queryFilter,option);
       responseData.headers = [];
       let showStatus = false;
       for (let i = 0; i < module.manageColumns.length; i++) {
           if(userColumn.columns.includes(module.manageColumns[i].name)){
               if(module.manageColumns[i].name === 'status') {
                   showStatus = true;
               }
               responseData.headers.push(module.manageColumns[i])
           }
       }
       if (responseData && responseData.docs && responseData.docs.length !== 0) {
           responseData.docs.forEach(user => {
               if(user.role){
                   user.role = user.role.charAt(0).toUpperCase()+user.role.slice(1).replace(/([A-Z])/g, ' $1').trim();
               }
               if(showStatus){
                   if (!user.signUpToken)
                       user.status = 'Active';
                   else
                       user.status = 'Pending';
               }
               delete user.signUpToken;
               delete user._id;
           })
       }
       res.status(200).send({status: 'SUCCESS', data: responseData});
   } catch (e) {
       Logger.log.error('Error occurred in filter list ', e.message || e);
       res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
   }
});

/**
 * Get Client Names
 */
router.get('/client-name',async function (req,res) {
    try {
        const [riskAnalystList,serviceManagerList] = await Promise.all([
            Client.find({$or:[{riskAnalystId:{'$exists': false}},{riskAnalystId: {$eq:null}}]}).select({'name':1,'_id':1}).lean(),
            Client.find({$or:[{serviceManagerId:{'$exists': false}},{serviceManagerId: {$eq:null}}]}).select({'name':1,'_id':1}).lean()]);
        res.status(200).send({status: 'SUCCESS', data: {riskAnalystList,serviceManagerList}});
    } catch (e) {
        Logger.log.error('Error occurred in get client name list ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get details of a user
 */
router.get('/:userId', async function (req, res) {
    Logger.log.info('In get user details call');
    if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
        Logger.log.error('User id not found in query params.');
        return res.status(400).send({status: 'ERROR', messageCode:'REQUIRE_FIELD_MISSING',message: 'Something went wrong, please try again.'});
    }
    let userId = req.params.userId;
    try {
        const systemModules = require('./../static-files/systemModules');
        let userData = await User.findById(userId)
            .select({name: 1, email: 1, contactNumber: 1, role: 1, moduleAccess:1}).lean();
        const query = userData.role === 'riskAnalyst' ? {riskAnalystId:req.params.userId} : {serviceManagerId:req.params.userId};
        const clientIds = await Client.find(query).select({'name':1,'_id':1}).lean();
        const moduleNames = userData.moduleAccess.map(i => i.name);
        let modules = {};
        systemModules.modules.forEach(i => {
            modules[i.name] = i;
            if(!moduleNames.includes(i.name)){
                userData.moduleAccess.push({name:i.name,accessTypes:[]})
            }
        });
        userData.moduleAccess.forEach(i => {
           i.isDefault = modules[i.name]['isDefault'];
           i.label = modules[i.name]['label'];
        });
        userData.clientIds = clientIds;
        Logger.log.info('Fetched details of user successfully.');
        res.status(200).send({status: 'SUCCESS', data: userData});
    } catch (e) {
        Logger.log.error('Error occurred.',  e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get the List of User
 */
router.get('/', async function (req, res) {
    Logger.log.info('In list user call');
    try {
        const module = StaticFile.modules.find(i => i.name === 'user');
        const userColumn = req.user.manageColumns.find(i => i.moduleName === 'user');
        let queryFilter = {
            isDeleted: false
        };
        let sortingOptions = {};
        if(req.query.sortBy && req.query.sortOrder){
            sortingOptions[req.query.sortBy] = req.query.sortOrder
        }
        if (req.query.search) queryFilter.name = {$regex: req.query.search, $options: 'i'};
        if (req.query.role){
            queryFilter.role = req.query.role
        }
        if (req.query.startDate && req.query.endDate){
            queryFilter.createdAt={$gte:req.query.startDate ,$lt:req.query.endDate}
        }
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        // option.select = {name: 1, email: 1, role: 1, createdAt: 1, contactNumber: 1, signUpToken: 1, moduleAccess: 1};
        option.select = userColumn.columns.toString().replace(/,/g, ' ') + ' signUpToken';
        option.sort = sortingOptions;
        option.lean = true;
        let responseObj = await User.paginate(queryFilter, option);
        responseObj.headers = [];
        let showStatus = false;
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(userColumn.columns.includes(module.manageColumns[i].name)){
                if(module.manageColumns[i].name === 'status') {
                    showStatus = true;
                }
                responseObj.headers.push(module.manageColumns[i])
            }
        }
        if (responseObj && responseObj.docs && responseObj.docs.length !== 0) {
            responseObj.docs.forEach(user => {
                if(user.role){
                    user.role = user.role.charAt(0).toUpperCase()+user.role.slice(1).replace(/([A-Z])/g, ' $1').trim();
                }
                if(showStatus){
                    if (!user.signUpToken)
                        user.status = 'Active';
                    else
                        user.status = 'Pending';
                }
                delete user.signUpToken;
                delete user._id;
            })
        }
        res.status(200).send({status: 'SUCCESS', data: responseObj});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Creates User
 */
router.post('/', async function (req, res) {
    Logger.log.info('In create user call');
    if (!req.user || !req.user._id) {
        Logger.log.error('You must login first to create a new user.');
        return res.status(401).send({status: 'ERROR',messageCode:'UNAUTHORIZED', message: 'You must login first to create a new user.'});
    }
    if (!req.body.email) {
        Logger.log.error('Email not present for new user');
        return res.status(400).send({status: 'ERROR', messageCode:'EMAIL_NOT_FOUND',message: 'Please enter email for new user.'});
    }
    try {
        const userData = await User.findOne({email:req.body.email,isDeleted:false}).lean();
        if(userData){
            return res.status(400).send({status: 'ERROR', messageCode:'USER_EXISTS',message: 'User already exists'});
        } else {
            // TODO add basic/default modules for the right
            let manageColumns = [];
            for (let i = 0; i < StaticFile.modules.length; i++) {
                manageColumns.push({moduleName:StaticFile.modules[i].name,columns:StaticFile.modules[i].defaultColumns})
            }
            let objToSave = req.body;
            objToSave.createdBy = req.user._id;
            objToSave.organizationId = req.user.organizationId;
            objToSave.manageColumns = manageColumns;
            let user = new User(objToSave);
            Logger.log.info('New user created successfully.');
            if(req.body.hasOwnProperty('clientId') && req.body.clientId.length !== 0){
                const update = objToSave.role === 'riskAnalyst' ? {riskAnalystId:user._id}: {serviceManagerId:user._id};
                await Client.update({_id:req.body.clientId},{$set:update},{multi:true});
            }
            let signUpToken = jwt.sign(JSON.stringify({_id: user._id}), config.jwt.secret);
            user.signUpToken = signUpToken;
            await user.save();
            let mailObj = {
                toAddress: [user.email],
                subject: 'Welcome to TRAD',
                text: {
                    name: user.name ? user.name : '',
                    setPasswordLink:
                        config.server.frontendUrls.adminPanelBase +
                        config.server.frontendUrls.setPasswordPage +
                        user._id +
                        '?token=' +
                        signUpToken,
                },
                mailFor: 'newAdminUser',
            };
            await addAuditLog({
                entityType: 'user',
                entityRefId: user._id,
                userType: 'user',
                userRefId: req.user._id,
                actionType: 'add',
                logDescription: 'User created successfully.'
            });
            Logger.log.info('User created successfully.');
            res.status(200).send({status: 'SUCCESS', message: 'User created successfully.'});
            await MailHelper.sendMail(mailObj);
            Logger.log.info('Mail sent to new user successfully.');
        }
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Updates User - Profile
 */
router.put('/profile', async function (req, res) {
    Logger.log.info('In user update profile call');
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', messageCode:'UNAUTHORIZED',message: 'Please first login to update the profile.'});
    }
    let updateObj = {};
    if (req.body.name) updateObj.name = req.body.name;
    if (req.body.contactNumber) updateObj.contactNumber = req.body.contactNumber;
    try {
        await User.findByIdAndUpdate(req.user._id, updateObj, {new: true});
        Logger.log.info('Updated user profile.');
        res.status(200).send({status: 'SUCCESS', message: 'User profile updated successfully.'});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Column Names
 */
router.put('/column-name',async function (req,res) {
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR',messageCode:'UNAUTHORIZED', message: 'Please first login to update the profile.'});
    }
    if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
        Logger.log.error('Require fields are missing');
        return res.status(400).send({status: 'ERROR', messageCode:'REQUIRE_FIELD_MISSING',message: 'Something went wrong, please try again.'});
    }
    try {
        let updateColumns = [];
        if(req.body.isReset){
            const module = StaticFile.modules.find(i => i.name === 'user');
            updateColumns = module.defaultColumns;
        } else {
            updateColumns = req.body.columns;
        }
        await User.updateOne({_id:req.user._id,'manageColumns.moduleName':'user'},{$set:{'manageColumns.$.columns':updateColumns}});
        res.status(200).send({status: 'SUCCESS', message:'Columns updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Updates a User
 */
router.put('/:userId', async function (req, res) {
    Logger.log.info('In user update call');
    if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
        Logger.log.error('User id not found in request query params.');
        return res.status(400).send({status: 'ERROR', messageCode:'REQUIRE_FIELD_MISSING',message: 'Something went wrong, please try again.'});
    }
    let userId = req.params.userId;
    try {
        const userData = await User.findOne({email:req.body.email,isDeleted:false}).lean();
        if(userData && userData._id !== req.params.userId){
            return res.status(400).send({status: 'ERROR', messageCode:'USER_EXISTS',message: 'User already exists'});
        } else {
            let updateObj = {};
            if (req.body.name) updateObj.name = req.body.name;
            if (req.body.contactNumber) updateObj.contactNumber = req.body.contactNumber;
            if (req.body.role) updateObj.role = req.body.role;
            if (req.body.moduleAccess) updateObj.moduleAccess = req.body.moduleAccess;
            let promises = [];
            if (req.body.hasOwnProperty('clientIds') && req.body.clientIds.length !== 0) {
                const query = updateObj.role === 'riskAnalyst' ? {riskAnalystId: req.params.userId} : {serviceManagerId: req.params.userId};
                const removeUser = updateObj.role === 'riskAnalyst' ? {riskAnalystId: null} : {serviceManagerId: null};
                const clients = await Client.find(query).lean();
                const oldClients = clients.map(i => i._id.toString());

                if (clients.length === 0) {
                    promises.push(Client.update({_id: {$in: req.body.clientIds}}, {$set: query}, {multi: true}))
                } else {
                    let newClients = [];
                    let sameClients = [];
                    req.body.clientIds.forEach(id => {
                        if (oldClients.includes(id)) {
                            oldClients.splice(oldClients.indexOf(id), 1);
                            sameClients.push(id)
                        } else {
                            newClients.push(id)
                        }
                    });
                    sameClients = sameClients.concat(oldClients);
                    promises.push(Client.update({_id: {$in: sameClients}}, {$set: query}, {multi: true}));
                    promises.push(Client.updateOne({_id: {$in: oldClients}}, {$set: removeUser}, {multi: true}));
                }
            }
            await User.updateOne({_id: userId}, updateObj, {new: true});
            await addAuditLog({
                entityType: 'user',
                entityRefId: req.params.userId,
                userType: 'user',
                userRefId: req.user._id,
                actionType: 'edit',
                logDescription: 'User updated successfully.'
            });
            await Promise.all(promises);
            Logger.log.info('User Updated successfully.');
            res.status(200).send({status: 'SUCCESS', message: 'User updated successfully.'});
        }
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Deletes a user
 */
router.delete('/:userId', async function (req, res) {
    Logger.log.info('In delete user call');
    if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
        Logger.log.error('User id not found.');
        return res.status(400).send({status: 'ERROR', messageCode:'REQUIRE_FIELD_MISSING', message: 'Something went wrong, please try again.'});
    }
    try {
        if(req.user._id.toString() === req.params.userId){
            return res.status(400).send({status: 'ERROR', messageCode:'BAD_REQUEST', message: 'User can\'t remove yourself'});
        }
        await User.updateOne({_id: req.params.userId}, {isDeleted: true});
        await addAuditLog({
            entityType: 'user',
            entityRefId: req.params.userId,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'delete',
            logDescription: 'User deleted successfully.'
        });
        res.status(200).send({status: 'SUCCESS', message: 'User deleted successfully.'});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Helper Functions
 */
function getProfileImagePath() {
    return config.uploadLocations.user.base + config.uploadLocations.user.profile;
}

function getProfileUrl(imageName) {
    if (imageName)
        if (imageName.indexOf(config.server.backendServerUrl + getProfileImagePath()) !== -1) return imageName;
        else return config.server.backendServerUrl + getProfileImagePath() + imageName;
    return '';
}

/**
 * Export Router
 */
module.exports = router;
