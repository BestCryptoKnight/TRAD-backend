/*
 * Module Imports
 * */
let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
const fs = require('fs');
let mongoose = require('mongoose');
const cors = require('cors');

/*
 * Local Imports
 * */
const config = require('./config');
let Logger = require('./services/logger');

/**
 * Global declarations
 */
let models = path.join(__dirname, 'models');
let dbURL = config.server.mongoDBConnectionUrl;

/**
 * Bootstrap Models
 */
fs.readdirSync(models).forEach((file) => require(path.join(models, file)));

/**
 * Bootstrap App
 */
let app = express();

/**
 * CORS
 */
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      ' X-Requested-With',
      ' Content-Type',
      ' Accept ',
      ' Authorization',
    ],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  }),
);
app.use(Logger.morgan);
app.use(bodyParser.json({ limit: '50mb' }));
app.use(
  bodyParser.urlencoded({
    limit: '50mb',
    extended: false,
  }),
);
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'upload')));

/**
 * Initialize CRON
 */
const SchedulerHelper = require('./services/cron.scheduler.service');
SchedulerHelper.scheduler();

/**
 * Import and Register Routes
 */
let index = require('./routes/index');
let clientIndex = require('./routes/clientIndex');
let riskIndex = require('./routes/riskIndex');

app.use('/', index);
app.use('/socket.io', function (req, res, next) {
  res.status(200).send();
});
app.use('/cp', clientIndex);
app.use('/rp', riskIndex);

/**
 * Catch 404 routes
 */
app.use(function (req, res, next) {
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

/**
 * Error Handler
 */
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.json(err);
});

/**
 * Mongoose Configuration
 */
mongoose.Promise = global.Promise;

mongoose.connection.on('connected', () => {
  Logger.log.info('DATABASE - Connected');
});

mongoose.connection.on('error', (err) => {
  Logger.log.error('DATABASE - Error:' + err);
});

mongoose.connection.on('disconnected', () => {
  Logger.log.warn('DATABASE - disconnected  Retrying....');
});

let connectDb = function () {
  const dbOptions = {
    poolSize: 5,
    reconnectTries: Number.MAX_SAFE_INTEGER,
    reconnectInterval: 500,
    useNewUrlParser: true,
  };
  mongoose.connect(dbURL, dbOptions).catch((err) => {
    Logger.log.fatal('DATABASE - Error:' + err);
  });
};

//Checks whether required attributes/documents are set in the database
const ProjectInitialization = require('./helper/projectInitialization');
ProjectInitialization.createSuperAdmin();
ProjectInitialization.createDefaultInsurer();
//TODO uncomment to check for illion alert profile
/*ProjectInitialization.checkForIllionProfile();*/

connectDb();
module.exports = app;
