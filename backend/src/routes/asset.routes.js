const express = require('express');
const AssetController = require('../controllers/assetController');
const { protect, adminOnly } = require('../middleware/auth');
const { assetValidators } = require('../validators');

const router = express.Router();

router.get('/', protect, assetValidators.list, AssetController.list);
router.get('/:id', protect, assetValidators.param, AssetController.get);
router.post('/', protect, adminOnly, assetValidators.create, AssetController.create);
router.put('/:id', protect, adminOnly, assetValidators.update, AssetController.update);
router.delete('/:id', protect, adminOnly, assetValidators.param, AssetController.remove);
router.patch('/:id/status', protect, adminOnly, assetValidators.update, AssetController.setStatus);
router.post('/:id/specifications', protect, adminOnly, assetValidators.addSpec, AssetController.addSpecification);
router.delete('/:id/specifications', protect, adminOnly, assetValidators.removeSpec, AssetController.removeSpecification);

module.exports = router;
