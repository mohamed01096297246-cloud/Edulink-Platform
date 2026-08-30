// Every collection except User (for the platform super-admin) and School
// itself carries a required `school` field. These two helpers are the only
// place tenant-scoping logic lives, so every controller enforces it the
// same way instead of hand-rolling the check.

// Builds a Mongo filter scoped to the caller's school, merged with any
// extra conditions. A platform super-admin has no school of their own, so
// they must explicitly say which school they're operating on via
// `?school=<id>` — returns null when that's missing, which callers should
// treat as "ask the caller to pick a school" rather than silently listing
// everything.
exports.scopeFilter = (req, extra = {}) => {
  if (req.user.isSuperAdmin) {
    if (!req.query.school) return null;
    return { ...extra, school: req.query.school };
  }

  return { ...extra, school: req.user.school };
};

// True when `doc` belongs to the caller's own school (or the caller is the
// platform super-admin, who can act across all schools). Use this before
// returning/mutating any document fetched by id — the id alone doesn't
// prove it belongs to the caller's tenant.
exports.sameSchool = (req, doc) => {
  if (!doc) return false;
  if (req.user.isSuperAdmin) return true;
  if (!doc.school || !req.user.school) return false;

  return doc.school.toString() === req.user.school.toString();
};

// The school id to stamp on a newly created document. Never trust a
// `school` field from the request body — it always comes from the
// authenticated user (or, for the super-admin creating on a school's
// behalf, from `?school=`).
exports.creationSchool = (req) => {
  if (req.user.isSuperAdmin) return req.query.school || req.body.school;
  return req.user.school;
};
