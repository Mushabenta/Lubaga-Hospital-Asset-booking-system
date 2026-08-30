const { body, param, query } = require('express-validator');
const { handleValidation } = require('../middleware/validate');

const phoneRule = (field = 'phone') =>
  body(field)
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^07[0-9]{8}$/).withMessage('Enter a valid Ugandan phone number (e.g. 0772123456)');

const passwordRule = (field = 'password', min = 6) =>
  body(field)
    .isString().withMessage('Password must be a string')
    .isLength({ min }).withMessage(`Password must be at least ${min} characters`);

const emailRule = (field = 'email') =>
  body(field)
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Enter a valid email address');

const usernameRule = (field = 'username') =>
  body(field)
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters');

const idRule = (field = 'id') =>
  param(field).isInt({ min: 1 }).withMessage('Invalid identifier');

const assetStatusRule = () =>
  body('status')
    .optional()
    .isIn(['available', 'under_maintenance', 'damaged', 'retired', 'unavailable'])
    .withMessage('Invalid asset status');

const bookingStatusRule = () =>
  body('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected', 'cancelled', 'active', 'completed'])
    .withMessage('Invalid booking status');

const authValidators = {
  register: [
    usernameRule(),
    emailRule(),
    phoneRule(),
    passwordRule('password', 6),
    body('serviceElement').trim().notEmpty().withMessage('Service element is required'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    handleValidation
  ],
  login: [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidation
  ],
  forgotPassword: [
    phoneRule(),
    passwordRule('newPassword', 6),
    handleValidation
  ],
  changePassword: [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    passwordRule('newPassword', 6),
    handleValidation
  ]
};

const userValidators = {
  createAdmin: [
    usernameRule(),
    emailRule(),
    phoneRule(),
    passwordRule('password', 6),
    body('serviceElement').trim().notEmpty().withMessage('Service element is required'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    handleValidation
  ],
  toggle: [idRule(), handleValidation],
  delete: [idRule(), handleValidation]
};

const assetValidators = {
  create: [
    body('name').trim().notEmpty().withMessage('Asset name is required'),
    body('code').trim().notEmpty().withMessage('Asset code is required'),
    body('category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid category'),
    assetStatusRule(),
    handleValidation
  ],
  update: [
    idRule(),
    body('name').optional().trim().notEmpty().withMessage('Asset name cannot be empty'),
    body('code').optional().trim().notEmpty().withMessage('Asset code cannot be empty'),
    body('category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid category'),
    assetStatusRule(),
    handleValidation
  ],
  param: [idRule(), handleValidation],
  addSpec: [
    idRule(),
    body('spec').trim().notEmpty().withMessage('Specification is required'),
    handleValidation
  ],
  removeSpec: [
    idRule(),
    body('spec').notEmpty().withMessage('Specification is required'),
    handleValidation
  ],
  list: [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page'),
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Invalid limit'),
    handleValidation
  ]
};

const bookingValidators = {
  create: [
    body('asset_id').isInt({ min: 1 }).withMessage('Valid asset_id is required'),
    body('start_time').notEmpty().withMessage('Start time is required').isISO8601().withMessage('Invalid start time'),
    body('end_time').notEmpty().withMessage('End time is required').isISO8601().withMessage('Invalid end time'),
    body('purpose').optional().trim(),
    handleValidation
  ],
  param: [idRule(), handleValidation],
  action: [
    idRule(),
    body('reason').optional().trim(),
    body('returned_by').optional().trim(),
    handleValidation
  ],
  list: [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page'),
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Invalid limit'),
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled', 'active', 'completed']),
    handleValidation
  ],
  availability: [
    body('asset_id').isInt({ min: 1 }).withMessage('Valid asset_id is required'),
    body('start_time').notEmpty().isISO8601().withMessage('Invalid start time'),
    body('end_time').notEmpty().isISO8601().withMessage('Invalid end time'),
    handleValidation
  ]
};

module.exports = { authValidators, userValidators, assetValidators, bookingValidators };
