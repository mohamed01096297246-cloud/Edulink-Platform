// Usernames are derived from the account's phone number rather than their
// name — names can now be Arabic (see the Arabic-translation work), which
// makes for an awkward, hard-to-type login username. Phone numbers are
// already required + unique on the User schema (see models/User.js), so
// stripping them down to digits gives a stable, unique, easy-to-type
// username for free — no random suffix needed.
function generateUsername(phoneNumber) {
  if (!phoneNumber) {
    throw new Error("Phone number is required to generate username");
  }

  const digitsOnly = phoneNumber.toString().trim().replace(/\D/g, "");

  if (!digitsOnly) {
    throw new Error("Phone number must contain at least one digit to generate a username");
  }

  return digitsOnly;
}

const generatePassword = () => {
  return Math.random().toString(36).slice(-8);
};

// A real person can legitimately hold two accounts here — a teacher whose
// own child is also a student needs a teacher account AND a parent account,
// both tied to the same phone number. Two accounts sharing a phone is fine
// (User.phoneNumber is unique per role, not globally — see the User model);
// two accounts sharing a *username* is not, since username is the sole
// login key. Both accounts would otherwise derive the identical digits-only
// username from that shared phone, so the second one created needs a
// distinguishable login name instead of colliding with the first.
//
// Takes the User model as a parameter rather than requiring it directly, to
// dodge any require-order/circular-import issue between this file and
// models/User.js.
const resolveUsername = async (phoneNumber, UserModel) => {
  const base = generateUsername(phoneNumber);

  const taken = await UserModel.exists({ username: base });
  if (!taken) return base;

  // The account already at `base` is a different role holding the same
  // phone (that's the only way this collides now — phoneNumber itself is
  // only unique per role). Suffix with a small, stable counter rather than
  // anything random, so the username stays short and predictable.
  for (let suffix = 2; suffix <= 9; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    // eslint-disable-next-line no-await-in-loop -- sequential on purpose,
    // this only ever runs more than one iteration in a truly rare collision.
    const candidateTaken = await UserModel.exists({ username: candidate });
    if (!candidateTaken) return candidate;
  }

  throw new Error(
    "sorry, could not generate a unique username for this phone number — too many accounts already share it.",
  );
};

// The login code a school issues in bulk off a printed sheet — students
// (who have no phone to derive a username from, and must not be identified
// by anything of their own) and teachers issued from the staff list alike.
// A code means nothing outside this system: six digits, typed on the
// phone's number pad with no keyboard switching, and short enough to copy
// off paper without mistakes. Six digits also never collide with the
// eleven-digit phone usernames every other account has.
const generateAccountCode = async (UserModel) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    // eslint-disable-next-line no-await-in-loop -- one query per attempt,
    // and a collision is rare enough that this almost never loops.
    const taken = await UserModel.exists({ username: code });
    if (!taken) return code;
  }

  throw new Error("تعذّر توليد كود دخول غير مستخدم. حاول مرة أخرى.");
};

// A coded account's password is printed once, never changed and never
// recovered (it is stored hashed), so it has to survive being read off
// paper — by a twelve-year-old, among others: no 0/O, no 1/l/I, and
// nothing case-sensitive to get wrong. Eight characters from this alphabet
// still leaves far too many combinations to guess at a login prompt.
const READABLE = "abcdefghjkmnpqrstuvwxyz23456789";

const generateReadablePassword = (length = 8) => {
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += READABLE[Math.floor(Math.random() * READABLE.length)];
  }
  return password;
};

module.exports = {
  generateUsername,
  generatePassword,
  resolveUsername,
  generateAccountCode,
  generateReadablePassword,
};
