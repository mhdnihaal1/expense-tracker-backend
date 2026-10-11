const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const money = z.coerce.number().positive('Must be greater than 0').max(1e12);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Must be a hex color like #22C55E');
const icon = z.string().min(1).max(40);

// Like schema.partial(), but drops defaults so PATCH bodies only contain fields that were sent.
function patchOf(schema) {
  const shape = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const base = field instanceof z.ZodDefault ? field.unwrap() : field;
    shape[key] = base.optional();
  }
  return z.object(shape);
}

module.exports = { z, objectId, money, color, icon, patchOf };
