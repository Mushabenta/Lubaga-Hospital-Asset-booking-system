const express = require('express');
const ReferenceController = require('../controllers/referenceController');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/categories', protect, ReferenceController.listCategories);
router.post('/categories', protect, adminOnly, ReferenceController.createCategory);
router.delete('/categories/:id', protect, adminOnly, ReferenceController.deleteCategory);

router.get('/departments', protect, ReferenceController.listDepartments);

module.exports = router;
