// ٠-٩ (Arabic-Indic) and ۰-۹ (Persian) to 0-9, as they're typed — so a
// phone entered on an Arabic keyboard passes the form's [0-9]{11} check
// and reaches the server as the same number it already knows. Mirrors
// backend/src/utils/phone.js.
export const toLatinDigits = (value) =>
  String(value ?? "").replace(/[٠-٩۰-۹]/g, (d) =>
    String(d.charCodeAt(0) & 0xf),
  );
