const mongoose = require("mongoose");

// Who teaches which subject to which class — decided before (and apart
// from) the timetable. A school assigns its teachers to classes at the start
// of the year and only then fits those assignments into periods; until the
// timetable exists, this is what tells a teacher's screens which classes are
// theirs (see utils/teacherClassrooms.js). Once it does, the timetable is
// built from it: picking a subject for a class fills in its assigned teacher.
//
// One teacher per subject per class, hence the unique index.
const classAssignmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  },
  { timestamps: true },
);

classAssignmentSchema.index({ classroom: 1, subject: 1 }, { unique: true });
classAssignmentSchema.index({ teacher: 1 });

module.exports = mongoose.model("ClassAssignment", classAssignmentSchema);
