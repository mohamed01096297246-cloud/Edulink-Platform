import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Award,
  Layers,
  FileText,
  Home,
  Save,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { API_URL } from "../../api/axios";

const TeacherExamMarks = () => {
  const [grades, setGrades] = useState([]);
  const [exams, setExams] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [students, setStudents] = useState([]);

  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [activeSubjectId, setActiveSubjectId] = useState(""); 


  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [marksData, setMarksData] = useState({});

  useEffect(() => {
    const fetchTeacherGrades = async () => {
      try {
        setLoadingGrades(true);
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `${API_URL}/results/teacher-grades`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.data.success) setGrades(res.data.data);
      } catch (err) {
        toast.error("Failed to load your assigned educational levels.");
      } finally {
        setLoadingGrades(false);
      }
    };
    fetchTeacherGrades();
  }, []);

  useEffect(() => {
    const fetchExamsAndClassrooms = async () => {
      if (!selectedGrade) {
        setExams([]);
        setClassrooms([]);
        return;
      }
      try {
        setLoadingFilters(true);
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `${API_URL}/results/grade-filters/${selectedGrade}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.data.success) {
          setExams(res.data.exams);
          setClassrooms(res.data.classrooms);
        }
      } catch (err) {
        toast.error("Error loading exams or classes for this level.");
      } finally {
        setLoadingFilters(false);
      }
    };

    setSelectedExam("");
    setSelectedClassroom("");
    setActiveSubjectId("");
    setStudents([]);
    setMarksData({});

    fetchExamsAndClassrooms();
  }, [selectedGrade]);

  useEffect(() => {
    if (!selectedExam) {
      setActiveSubjectId("");
      return;
    }
    const currentExamObj = exams.find((e) => e._id === selectedExam);

    if (currentExamObj && currentExamObj.timetable?.length > 0) {
      const subjectRef =
        currentExamObj.timetable[0].subject?._id ||
        currentExamObj.timetable[0].subject;
      setActiveSubjectId(subjectRef);
    }
  }, [selectedExam, exams]);

  useEffect(() => {
    const fetchClassroomStudents = async () => {
      if (!selectedClassroom) {
        setStudents([]);
        return;
      }
      try {
        setLoadingStudents(true);
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `${API_URL}/results/classroom-students/${selectedClassroom}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.data.success) setStudents(res.data.data);
      } catch (err) {
        toast.error("Failed to fetch classroom student roster.");
      } finally {
        setLoadingStudents(false);
      }
    };

    setMarksData({});
    fetchClassroomStudents();
  }, [selectedClassroom]);

  const handleMarkChange = (studentId, value) => {
    setMarksData((prev) => ({
      ...prev,
      [studentId]: value,
    }));
  };

  const handleSubmitMarks = async () => {
    if (!selectedExam) return toast.error("Please pick an Exam first!");
    if (!activeSubjectId)
      return toast.error("No valid subject bound to this exam.");
    if (!selectedClassroom)
      return toast.error("Please select a Classroom cluster!");
    if (students.length === 0)
      return toast.error("No students found to evaluate.");

    const gradesList = Object.entries(marksData)
      .filter(([_, score]) => score !== undefined && score.trim() !== "")
      .map(([studentId, score]) => ({
        studentId: studentId,
        grade: Number(score),
      }));

    if (gradesList.length === 0) {
      return toast.error("Please enter at least one score on the roster.");
    }

    const hasInvalidScore = gradesList.some(
      (rec) => rec.grade < 0 || rec.grade > 100,
    );
    if (hasInvalidScore) {
      return toast.error(
        "Scores must remain securely within the 0 to 100 limit.",
      );
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem("token");

      const response = await axios.post(
        `${API_URL}/results/add`,
        {
          examId: selectedExam,
          subjectId: activeSubjectId,
          gradesList,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        toast.success(response.data.message || "Grades successfully recorded!");
        setMarksData({});
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to submit student exam scores.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700"
      dir="ltr"
    >
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-wrap gap-4 justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800">
            Exam Grading Sheets
          </h2>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">
            Bulk log academic evaluation metrics for your assigned sections
          </p>
        </div>

        <button
          onClick={handleSubmitMarks}
          disabled={submitting || students.length === 0}
          className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          Save Grading Sheet
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
            <Layers size={14} className="text-indigo-500" /> 1. Select Grade
            Level
          </label>
          <div className="relative">
            {loadingGrades && (
              <Loader2
                className="absolute right-3 top-3 animate-spin text-slate-400"
                size={16}
              />
            )}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="">-- Choose Grade Level --</option>
              {grades.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name} ({g.academicYear})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
            <FileText size={14} className="text-indigo-500" /> 2. Select Exam
            Target
          </label>
          <div className="relative">
            {loadingFilters && (
              <Loader2
                className="absolute right-3 top-3 animate-spin text-slate-400"
                size={16}
              />
            )}
            <select
              value={selectedExam}
              disabled={!selectedGrade || loadingFilters}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 cursor-pointer"
            >
              <option value="">-- Choose Exam --</option>
              {exams.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.title}{" "}
                  {e.timetable?.[0]?.subject?.name
                    ? `[${e.timetable[0].subject.name}]`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider">
            <Home size={14} className="text-indigo-500" /> 3. Select Classroom
            Section
          </label>
          <div className="relative">
            {loadingFilters && (
              <Loader2
                className="absolute right-3 top-3 animate-spin text-slate-400"
                size={16}
              />
            )}
            <select
              value={selectedClassroom}
              disabled={!selectedGrade || loadingFilters}
              onChange={(e) => setSelectedClassroom(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 cursor-pointer"
            >
              <option value="">-- Choose Classroom --</option>
              {classrooms.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loadingStudents ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-3 text-indigo-600" size={36} />
          <p className="font-bold">Deploying filtered student sheets...</p>
        </div>
      ) : students.length > 0 ? (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in-50 duration-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest">
                <th className="px-8 py-5">Student Information</th>
                <th className="px-8 py-5 w-1/3 text-center">
                  Grades Score (Max: 100)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((student) => (
                <tr
                  key={student._id}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center font-black">
                        {student.firstName ? student.firstName[0] : "S"}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">
                          {student.firstName} {student.lastName}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">
                          ID: {student._id.slice(-6)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center justify-center gap-3 max-w-[200px] mx-auto">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="0 - 100"
                        value={marksData[student._id] || ""}
                        onChange={(e) =>
                          handleMarkChange(student._id, e.target.value)
                        }
                        className="w-full text-center px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                      />
                      <Award size={18} className="text-slate-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 p-10 rounded-[2.5rem] text-center">
          <AlertCircle className="mx-auto text-amber-500 mb-4" size={44} />
          <h3 className="text-lg font-black text-amber-900">
            No Target Students Displayed
          </h3>
          <p className="text-amber-700 font-medium text-sm">
            Complete the 3-tier selections above to automatically deploy the
            student grading roster.
          </p>
        </div>
      )}
    </div>
  );
};

export default TeacherExamMarks;
