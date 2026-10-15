import React, { useEffect, useMemo, useState } from "react";
import API from "../../api/axios";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Printer,
  Search,
  UserPlus,
  X,
} from "lucide-react";

const PAGE = 100;

// Arabic-keyboard digits to Latin, so a number typed either way reads the same.
const latinDigits = (value) =>
  String(value || "").replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));

// Names are written many ways (أحمد / احمد، فاطمة / فاطمه، على / علي), so
// both the search and the names it looks through are brought to one form.
const normalizeArabic = (value) =>
  latinDigits(value)
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const credentialText = (c) =>
  [
    `ولي الأمر: ${c.parentName}`,
    c.students ? `الطالب: ${c.students}` : null,
    `اسم المستخدم: ${c.username}`,
    `كلمة المرور: ${c.password}`,
  ]
    .filter(Boolean)
    .join("\n");

// The platform owner's tool on the schools page: every student of one school
// with the parent account they belong to, moving a student onto the right
// parent (or a new account), and new login details for a parent who lost
// theirs (backend familyAccessController). Passwords are stored hashed, so
// the ones made here are kept on screen for this visit only, to copy or print.
const FamilyAccessManager = ({ school, onClose, showToast }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [shown, setShown] = useState(PAGE);

  const [linkTarget, setLinkTarget] = useState(null);
  const [reissueTarget, setReissueTarget] = useState(null);
  const [issued, setIssued] = useState([]);

  const base = `/schools/${school._id}/families`;

  const load = async () => {
    try {
      const res = await API.get(base);
      setRows(res.data.data.students || []);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل تحميل الطلاب", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school._id]);

  const grades = useMemo(() => {
    const seen = new Map();
    rows.forEach((r) => r.gradeId && !seen.has(r.gradeId) && seen.set(r.gradeId, r.grade));
    return [...seen.entries()];
  }, [rows]);

  // Every word typed has to appear somewhere in the student's or parent's
  // name, username or phone, in any order. A name written on paper often
  // differs from the record by a word (حسن for احمد), so when nothing has
  // every word, the students missing just one are offered as close matches.
  const { filtered, close } = useMemo(() => {
    const inGrade = rows.filter((r) => !grade || r.gradeId === grade);
    const words = normalizeArabic(search).split(" ").filter(Boolean);
    if (!words.length) return { filtered: inGrade, close: false };

    const scored = inGrade.map((r) => {
      const p = r.parent || {};
      const hay = normalizeArabic([r.name, p.name, p.username, p.phoneNumber].join(" "));
      return { r, hits: words.filter((w) => hay.includes(w)).length };
    });
    const exact = scored.filter((x) => x.hits === words.length).map((x) => x.r);
    if (exact.length || words.length < 2) return { filtered: exact, close: false };

    const near = scored
      .filter((x) => x.hits === words.length - 1)
      .map((x) => x.r);
    return { filtered: near, close: near.length > 0 };
  }, [rows, search, grade]);

  useEffect(() => setShown(PAGE), [search, grade]);

  const parentCount = new Set(rows.map((r) => r.parent?._id).filter(Boolean)).size;

  const remember = (entry) => setIssued((prev) => [entry, ...prev]);

  const copy = (text, message) => {
    navigator.clipboard?.writeText(text);
    showToast(message, "success");
  };

  const printIssued = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const cells = issued
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.parentName)}</td><td>${escapeHtml(c.students)}</td>` +
          `<td dir="ltr">${escapeHtml(c.username)}</td><td dir="ltr">${escapeHtml(c.password)}</td></tr>`,
      )
      .join("");
    const title = `بيانات دخول أولياء الأمور — ${escapeHtml(school.name)}`;
    win.document.write(
      `<html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>` +
        `<style>body{font-family:Arial,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}` +
        `td,th{border:1px solid #999;padding:8px;text-align:right;font-size:14px}th{background:#eef}</style></head>` +
        `<body><h3>${title}</h3><table><tr><th>ولي الأمر</th><th>الطالب</th>` +
        `<th>اسم المستخدم</th><th>كلمة المرور</th></tr>${cells}</table></body></html>`,
    );
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-6 bg-teal-600 text-white flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-black">الطلاب وأولياء الأمور — {school.name}</h2>
            <p className="text-teal-50 text-xs font-bold mt-1">
              اربط كل طالب بحساب ولي أمره، واعمل بيانات دخول جديدة لولي الأمر اللي نسيها.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X />
          </button>
        </div>

        <div className="p-6 pb-3 flex flex-col md:flex-row gap-3 flex-shrink-0 border-b border-slate-100">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-xl px-3.5 border-2 border-transparent focus-within:border-teal-500 transition-all">
            <Search size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الطالب أو ولي الأمر أو رقم الموبايل..."
              className="flex-1 py-3.5 bg-transparent font-bold text-sm text-slate-700 outline-none"
            />
          </div>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="p-3.5 bg-slate-50 rounded-xl font-bold text-sm text-slate-700 outline-none border-2 border-transparent focus:border-teal-500 transition-all"
          >
            <option value="">كل الصفوف</option>
            {grades.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1">
          {issued.length > 0 && (
            <div className="m-6 mb-0 p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-amber-800 text-sm">
                  بيانات الدخول اللي اتعملت دلوقتي ({issued.length}) — انسخها أو اطبعها قبل ما تقفل، كلمات السر مش هتظهر تاني.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(issued.map(credentialText).join("\n\n"), "اتنسخت كل البيانات")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-amber-800 rounded-xl text-xs font-black border border-amber-200 hover:bg-amber-100"
                  >
                    <ClipboardCopy size={14} /> نسخ الكل
                  </button>
                  <button
                    onClick={printIssued}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-amber-800 rounded-xl text-xs font-black border border-amber-200 hover:bg-amber-100"
                  >
                    <Printer size={14} /> طباعة
                  </button>
                </div>
              </div>
              {issued.map((c, i) => (
                <div key={i} className="bg-white rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-black text-slate-800">{c.parentName}</p>
                    {c.students && <p className="text-slate-500 text-xs font-bold">{c.students}</p>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>
                      <span className="text-slate-400 text-xs font-bold">اسم المستخدم </span>
                      <b className="font-mono" dir="ltr">{c.username}</b>
                    </span>
                    <span>
                      <span className="text-slate-400 text-xs font-bold">كلمة المرور </span>
                      <b className="font-mono" dir="ltr">{c.password}</b>
                    </span>
                    <button
                      onClick={() => copy(credentialText(c), "اتنسخت بيانات الدخول")}
                      title="نسخ"
                      className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-6 pt-4 text-xs font-bold text-slate-400">
            {loading ? "" : `${rows.length} طالب · ${parentCount} حساب ولي أمر · ظاهر ${Math.min(shown, filtered.length)} من ${filtered.length}`}
          </div>

          <div className="p-6 pt-3 space-y-2.5">
            {close && (
              <p className="p-3.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-black">
                مفيش طالب اسمه مطابق بالظبط — دي أقرب النتايج (كل الكلمات موجودة ما عدا كلمة واحدة). اتأكد إنه الطالب الصح قبل الربط.
              </p>
            )}
            {loading ? (
              <div className="py-16 text-center">
                <Loader2 className="animate-spin inline text-teal-600" size={32} />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-slate-400 font-bold text-sm py-10 text-center">
                {rows.length ? "مفيش نتايج مطابقة للبحث." : "مفيش طلاب مسجلين في المدرسة دي لسه."}
              </p>
            ) : (
              filtered.slice(0, shown).map((r) => (
                <div
                  key={r._id}
                  className="bg-slate-50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="md:w-1/3">
                    <p className="font-black text-slate-800">{r.name}</p>
                    <p className="text-slate-500 text-xs font-bold mt-0.5">
                      {[r.grade, r.classroom].filter(Boolean).join(" · ") || "بدون فصل"}
                      {!r.active && <span className="text-rose-500"> · غير نشط</span>}
                    </p>
                  </div>
                  <div className="flex-1 text-sm">
                    {r.parent ? (
                      <>
                        <p className="font-bold text-slate-700">
                          {r.parent.name}
                          {r.parent.children > 1 && (
                            <span className="mr-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-50 text-teal-700">
                              {r.parent.children} أبناء
                            </span>
                          )}
                          {!r.parent.active && (
                            <span className="mr-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-600">
                              التطبيق مقفول
                            </span>
                          )}
                        </p>
                        <p className="text-slate-500 text-xs font-bold mt-0.5" dir="ltr">
                          {r.parent.username}
                          {r.parent.phoneNumber && r.parent.phoneNumber !== r.parent.username
                            ? ` · ${r.parent.phoneNumber}`
                            : ""}
                        </p>
                      </>
                    ) : (
                      <p className="font-bold text-rose-600 text-xs">مش مربوط بحساب ولي أمر</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setLinkTarget(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-teal-700 hover:bg-teal-100 rounded-xl transition-all text-xs font-bold"
                    >
                      <Link2 size={14} /> ربط بولي أمر
                    </button>
                    {r.parent && (
                      <button
                        onClick={() => setReissueTarget(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-amber-700 hover:bg-amber-100 rounded-xl transition-all text-xs font-bold"
                      >
                        <KeyRound size={14} /> بيانات دخول جديدة
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {!loading && filtered.length > shown && (
              <button
                onClick={() => setShown((n) => n + PAGE)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-black"
              >
                عرض المزيد
              </button>
            )}
          </div>
        </div>
      </div>

      {linkTarget && (
        <LinkDialog
          base={base}
          student={linkTarget}
          onClose={() => setLinkTarget(null)}
          showToast={showToast}
          onDone={(data) => {
            setLinkTarget(null);
            if (data.credentials) {
              remember({
                parentName: data.parent.name,
                students: data.parent.children.join("، "),
                ...data.credentials,
              });
            }
            const left = data.previous && data.previous.childrenLeft === 0
              ? ` الحساب القديم (${data.previous.username}) بقى من غير أبناء.`
              : "";
            showToast(`الطالب اتربط بحساب ${data.parent.name}.${left}`, "success");
            load();
          }}
        />
      )}

      {reissueTarget && (
        <ReissueDialog
          base={base}
          row={reissueTarget}
          onClose={() => setReissueTarget(null)}
          showToast={showToast}
          onDone={(data) => {
            setReissueTarget(null);
            remember({
              parentName: data.parent.name,
              students: data.parent.children.join("، "),
              ...data.credentials,
            });
            showToast("اتعملت كلمة سر جديدة", "success");
          }}
        />
      )}
    </div>
  );
};

// Moves one student onto the parent account of a phone — the existing one,
// shown before confirming, or a new account when the phone has none.
const LinkDialog = ({ base, student, onClose, onDone, showToast }) => {
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState(null);
  const [looking, setLooking] = useState(false);
  const [firstName, setFirstName] = useState(student.lastName || "");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  const digits = latinDigits(phone).replace(/\D/g, "");

  useEffect(() => {
    setLookup(null);
    if (digits.length !== 11) return undefined;
    let cancelled = false;
    setLooking(true);
    API.get(`${base}/parent`, { params: { phone: digits } })
      .then((res) => !cancelled && setLookup(res.data.data))
      .catch((err) => !cancelled && setLookup({ error: err.response?.data?.message || "رقم غير صحيح" }))
      .finally(() => !cancelled && setLooking(false));
    return () => {
      cancelled = true;
    };
  }, [base, digits]);

  const same = lookup?.parent && student.parent && lookup.parent._id === student.parent._id;
  const canSave =
    lookup && !lookup.error && !lookup.otherSchool && !same && (lookup.parent || firstName.trim());

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await API.post(`${base}/${student._id}/link`, {
        phone: digits,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      onDone(res.data.data);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل الربط", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/40">
      <form onSubmit={save} className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl p-7 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-black text-slate-800 text-lg">ربط {student.name} بولي أمر</h3>
            <p className="text-slate-500 text-xs font-bold mt-1">
              {student.parent
                ? `مربوط دلوقتي بـ ${student.parent.name} (${student.parent.username})`
                : "مش مربوط بأي حساب دلوقتي"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-400 mr-2">رقم موبايل ولي الأمر</label>
          <input
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            dir="ltr"
            className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-teal-500 outline-none font-bold text-sm tracking-wider text-right"
          />
        </div>

        {looking && <Loader2 className="animate-spin text-teal-600" size={20} />}

        {lookup?.error && <p className="text-rose-600 text-sm font-bold">{lookup.error}</p>}

        {lookup?.otherSchool && (
          <p className="text-rose-600 text-sm font-bold flex items-center gap-2">
            <AlertTriangle size={16} /> الرقم ده متسجل لولي أمر في مدرسة تانية.
          </p>
        )}

        {lookup?.parent && (
          <div className={`rounded-2xl p-4 ${same ? "bg-slate-50" : "bg-teal-50"}`}>
            <p className="font-black text-slate-800 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-teal-600" /> {lookup.parent.name}
            </p>
            <p className="text-xs font-bold text-slate-500 mt-1" dir="ltr">
              {lookup.parent.username}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-2">
              {lookup.parent.children.length
                ? `أبناءه دلوقتي: ${lookup.parent.children.join("، ")}`
                : "مفيش أبناء على الحساب ده دلوقتي"}
            </p>
            {same && <p className="text-xs font-black text-slate-500 mt-2">الطالب مربوط بالحساب ده بالفعل.</p>}
          </div>
        )}

        {lookup && !lookup.error && !lookup.otherSchool && !lookup.parent && (
          <div className="rounded-2xl p-4 bg-amber-50 space-y-3">
            <p className="text-sm font-black text-amber-800 flex items-center gap-2">
              <UserPlus size={16} /> مفيش حساب على الرقم ده — هيتعمل حساب ولي أمر جديد وتظهرلك بيانات دخوله.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="اسم ولي الأمر"
                className="p-3 bg-white rounded-xl border-2 border-transparent focus:border-amber-400 outline-none font-bold text-sm"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="باقي الاسم (اختياري)"
                className="p-3 bg-white rounded-xl border-2 border-transparent focus:border-amber-400 outline-none font-bold text-sm"
              />
            </div>
          </div>
        )}

        <button
          disabled={!canSave || saving}
          className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : lookup && !lookup.parent ? (
            "اعمل الحساب واربط الطالب"
          ) : (
            "اربط الطالب"
          )}
        </button>
      </form>
    </div>
  );
};

// A new password for the parent account a student is under. The username
// stays; the old password stops working.
const ReissueDialog = ({ base, row, onClose, onDone, showToast }) => {
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      const res = await API.post(`${base}/parents/${row.parent._id}/reissue`);
      onDone(res.data.data);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل عمل كلمة سر جديدة", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/40">
      <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-7 space-y-4 text-center">
        <KeyRound className="mx-auto text-amber-500" size={36} />
        <div>
          <p className="font-black text-slate-800">بيانات دخول جديدة لـ {row.parent.name}؟</p>
          <p className="text-slate-500 text-sm font-medium mt-2">
            اسم المستخدم هيفضل <b dir="ltr">{row.parent.username}</b>، وهتتعمل كلمة سر جديدة. كلمة السر
            القديمة هتبطل فورًا لأي دخول جديد، والموبايل اللي ولي الأمر داخل عليه دلوقتي هيفضل شغال عادي.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
          >
            تراجع
          </button>
          <button
            onClick={confirm}
            disabled={saving}
            className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : "اعمل كلمة سر جديدة"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FamilyAccessManager;
