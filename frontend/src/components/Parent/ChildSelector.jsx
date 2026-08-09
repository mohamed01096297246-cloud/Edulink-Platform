import React from "react";

function ChildSelector({ children, selectedChild, onSelect }) {
  return (
    <div className="flex items-center bg-slate-100 rounded-xl px-3 py-1.5 border border-slate-200">
      <select
        value={selectedChild?.studentInfo?.id || ""}
        onChange={(e) => {
          const child = children.find(
            (c) => c.studentInfo.id === e.target.value,
          );
          if (child) onSelect(child);
        }}
        className="bg-transparent text-slate-700 text-xs font-bold outline-none cursor-pointer"
      >
        {children.map((child) => (
          <option key={child.studentInfo.id} value={child.studentInfo.id}>
            {child.studentInfo.fullName} ({child.studentInfo.classroom})
          </option>
        ))}
      </select>
    </div>
  );
}

export default ChildSelector;
