const { HttpError } = require('./error');

// Validates req[source] against a zod schema and replaces it with the parsed value.
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return next(new HttpError(400, 'Validation failed', fields));
    }
    if (source === 'query') req.validQuery = result.data;
    else req[source] = result.data;
    next();
  };
}

module.exports = { validate };
