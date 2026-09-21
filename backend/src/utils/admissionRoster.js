// Pure helpers behind the new-admissions roster (AdmissionCandidate): how
// a sheet's names become the form's two name fields, and how siblings are
// found and given one shared phone number. No database access here — the
// importer feeds rows in and writes the answers back.

// Second halves that belong to the name before them: "تيم الله", "سيف
// الدين", "فاطمة الزهراء". Counted as one name, so "تيم الله اسلام محمد"
// splits after "اسلام", not after "الله".
const JOINS_PREVIOUS = new Set(["الله", "الدين", "الزهراء", "الاسلام", "الرحمن"]);
// First halves that take the name after them: "عبد الرحمن", "ابو زيد".
const JOINS_NEXT = new Set(["عبد", "ابو", "أبو"]);

// A sheet's name as the form will accept it — letters and single spaces.
// Drops the notes schools write into name cells ("(متوفي)"), and the
// slashes around a disputed name ("خالد /محمدكمال/ عبدالعليم").
const cleanName = (value) =>
  String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-zء-ي\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const nameParts = (value) => {
  const parts = [];
  for (const token of cleanName(value).split(" ").filter(Boolean)) {
    const last = parts[parts.length - 1];
    if (last && (JOINS_NEXT.has(last) || JOINS_PREVIOUS.has(token))) {
      parts[parts.length - 1] = `${last} ${token}`;
    } else {
      parts.push(token);
    }
  }
  return parts;
};

// The school's existing students are stored first-two-names / the rest
// ("تاليا محمد" / "صلاح محمد"), and so are these. A two-part name gives
// one to each field, since both are required.
const splitName = (value) => {
  const parts = nameParts(value);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return {
    firstName: parts.slice(0, 2).join(" "),
    lastName: parts.slice(2).join(" "),
  };
};

// Groups children into households — any two whose families share a phone
// number are the same family, transitively — and picks each household's
// one number to register under.
//
// The number is the one written down for the most of the household's
// children: it's the number the family itself keeps giving the school. A
// tie goes to whichever the family wrote first, taking children in the
// order given. A child with no siblings simply keeps the first number
// written.
//
// `entries` is [{ key, phones: [..] }]; returns Map key → { household,
// primaryPhone }. `household` is the household's lowest phone number — a
// stable id that stays the same however often the sheet is re-imported.
const assignHouseholds = (entries) => {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const { phones } of entries) {
    for (const phone of phones) if (!parent.has(phone)) parent.set(phone, phone);
    for (let i = 1; i < phones.length; i += 1) union(phones[0], phones[i]);
  }

  const members = new Map();
  for (const entry of entries) {
    if (!entry.phones.length) continue;
    const root = find(entry.phones[0]);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(entry);
  }

  const result = new Map();
  for (const group of members.values()) {
    const counts = new Map();
    const firstSeen = new Map();
    let order = 0;
    for (const { phones } of group) {
      for (const phone of phones) {
        counts.set(phone, (counts.get(phone) || 0) + 1);
        if (!firstSeen.has(phone)) firstSeen.set(phone, order++);
      }
    }

    const ranked = [...counts.keys()].sort(
      (a, b) => counts.get(b) - counts.get(a) || firstSeen.get(a) - firstSeen.get(b),
    );
    const household = [...counts.keys()].sort()[0];

    for (const entry of group) {
      result.set(entry.key, { household, primaryPhone: ranked[0] });
    }
  }

  for (const entry of entries) {
    if (!result.has(entry.key)) result.set(entry.key, { household: "", primaryPhone: "" });
  }

  return result;
};

module.exports = { cleanName, nameParts, splitName, assignHouseholds };
