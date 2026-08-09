const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    nationalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    role: {
      type: String,
      enum: ["admin", "teacher", "parent"],
      default: "parent",
    },
    
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null 
    },
teachingGrades: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Grade"
  }],
    username: {
      type: String,
      unique: true,
      trim: true,
      required: true, 
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: true, 
    },

    linkedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, 
  }
);


userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password.trim(), 10);

});


userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
