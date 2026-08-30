const Asset = require('../models/Asset');
const Booking = require('../models/Booking');
const { Category } = require('../models/Reference');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');

const AssetService = {
  async list(query) {
    return Asset.findAll({
      search: query.search,
      status: query.status,
      categoryId: query.categoryId,
      department: query.department,
      page: query.page,
      limit: query.limit
    });
  },

  async get(id, actor) {
    const asset = await Asset.findById(id);
    if (!asset) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    return asset;
  },

  async create(data, actor) {
    const name = String(data.name || '').trim();
    if (!name) throw new ApiError(400, 'Asset name is required', 'NAME_REQUIRED');

    const code = String(data.code || '').trim();
    if (!code) throw new ApiError(400, 'Asset code is required', 'CODE_REQUIRED');

    const existingName = await Asset.findByName(name);
    if (existingName) throw new ApiError(400, 'Asset name already exists', 'NAME_TAKEN');

    const existingCode = await Asset.findByCode(code);
    if (existingCode) throw new ApiError(400, 'Asset code already exists', 'CODE_TAKEN');

    if (data.category_id) {
      const category = await Category.findById(data.category_id);
      if (!category) throw new ApiError(400, 'Invalid category', 'INVALID_CATEGORY');
    }

    const specs = Array.isArray(data.specifications)
      ? data.specifications.filter((s) => s && String(s).trim())
      : [];

    let asset = await Asset.create({ ...data, name, code });
    if (specs.length) {
      await Asset.setSpecifications(asset.id, specs);
    }
    asset = await Asset.findById(asset.id);

    await AuditLog.create({
      userId: actor.id,
      action: 'ASSET_CREATED',
      entity: 'asset',
      entityId: asset.id,
      details: { name, code, status: asset.status }
    });

    return asset;
  },

  async update(id, data, actor) {
    const asset = await Asset.findById(id);
    if (!asset) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');

    const fields = {};

    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new ApiError(400, 'Asset name cannot be empty', 'NAME_REQUIRED');
      const dup = await Asset.findByName(name);
      if (dup && dup.id !== Number(id)) throw new ApiError(400, 'Asset name already exists', 'NAME_TAKEN');
      fields.name = name;
    }
    if (data.code !== undefined) {
      const code = String(data.code).trim();
      if (!code) throw new ApiError(400, 'Asset code cannot be empty', 'CODE_REQUIRED');
      const dup = await Asset.findByCode(code);
      if (dup && dup.id !== Number(id)) throw new ApiError(400, 'Asset code already exists', 'CODE_TAKEN');
      fields.code = code;
    }
    if (data.category_id !== undefined) {
      if (data.category_id) {
        const category = await Category.findById(data.category_id);
        if (!category) throw new ApiError(400, 'Invalid category', 'INVALID_CATEGORY');
      }
      fields.category_id = data.category_id || null;
    }
    if (data.description !== undefined) fields.description = data.description;
    if (data.department !== undefined) fields.department = data.department;
    if (data.location !== undefined) fields.location = data.location;
    if (data.serial_number !== undefined) fields.serial_number = data.serial_number;
    if (data.condition_name !== undefined) fields.condition_name = data.condition_name;
    if (data.image_url !== undefined) fields.image_url = data.image_url;

    // Status change guarded separately (asset status is a well-defined state).
    if (data.status !== undefined) {
      const valid = ['available', 'under_maintenance', 'damaged', 'retired', 'unavailable'];
      if (!valid.includes(data.status)) {
        throw new ApiError(400, 'Invalid asset status', 'INVALID_STATUS');
      }
      fields.status = data.status;
    }

    await Asset.update(id, fields);

    if (data.specifications !== undefined) {
      const specs = Array.isArray(data.specifications)
        ? data.specifications.filter((s) => s && String(s).trim())
        : [];
      await Asset.setSpecifications(id, specs);
    }

    const updated = await Asset.findById(id);

    await AuditLog.create({
      userId: actor.id,
      action: 'ASSET_UPDATED',
      entity: 'asset',
      entityId: updated.id,
      details: { fields: Object.keys(fields) }
    });

    return updated;
  },

  async setStatus(id, status, actor) {
    return AssetService.update(id, { status }, actor);
  },

  async addSpecification(id, spec, actor) {
    const asset = await Asset.findById(id);
    if (!asset) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    spec = String(spec || '').trim();
    if (!spec) throw new ApiError(400, 'Specification is required', 'SPEC_REQUIRED');

    const exists = asset.specifications.includes(spec);
    if (exists) throw new ApiError(400, 'Specification already exists', 'SPEC_EXISTS');

    await Asset.addSpecification(id, spec);
    const updated = await Asset.findById(id);

    await AuditLog.create({
      userId: actor.id,
      action: 'ASSET_SPEC_ADD',
      entity: 'asset',
      entityId: id,
      details: { spec }
    });
    return updated;
  },

  async removeSpecification(id, spec, actor) {
    const asset = await Asset.findById(id);
    if (!asset) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');
    spec = String(spec || '');
    const removed = await Asset.removeSpecification(id, spec);
    if (!removed) throw new ApiError(404, 'Specification not found', 'SPEC_NOT_FOUND');
    const updated = await Asset.findById(id);

    await AuditLog.create({
      userId: actor.id,
      action: 'ASSET_SPEC_REMOVE',
      entity: 'asset',
      entityId: id,
      details: { spec }
    });
    return updated;
  },

  async remove(id, actor) {
    const asset = await Asset.findById(id);
    if (!asset) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');

    // Prevent deleting an asset that is referenced by any booking.
    const { pool } = require('../config/db');
    const { rows } = await pool.query('SELECT 1 FROM bookings WHERE asset_id = $1 LIMIT 1', [id]);
    if (rows.length) {
      throw new ApiError(400, 'Cannot remove asset - it is used in existing bookings', 'ASSET_IN_USE');
    }

    await Asset.deleteById(id);
    await AuditLog.create({
      userId: actor.id,
      action: 'ASSET_DELETED',
      entity: 'asset',
      entityId: id,
      details: { name: asset.name }
    });
    return asset;
  }
};

module.exports = AssetService;
