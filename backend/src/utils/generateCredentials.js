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

module.exports = {
  generateUsername,
  generatePassword,
};
