const { isValidObjectId } = require('mongoose');
const { HttpError } = require('../middleware/error');

// Fetch a document that must belong to the user, or throw 404.
async function findOwned(Model, id, userId, label = Model.modelName) {
  if (!isValidObjectId(id)) throw new HttpError(404, `${label} not found`);
  const doc = await Model.findOne({ _id: id, userId });
  if (!doc) throw new HttpError(404, `${label} not found`);
  return doc;
}

module.exports = { findOwned };
