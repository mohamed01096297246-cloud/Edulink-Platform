import { useMemo } from "react";

// How far the signed-in admin's remit reaches, read from what the server
// said at login. The server enforces all of this regardless — this is only
// so the panel shows the right screens instead of offering buttons that
// would come back refused.
//
//   canEdit        false for whoever oversees a school that has principals:
//                  entering and changing records is their work, not his.
//   ownStages      the stages a principal presides over; empty = the school.
//   browsesByStage true when the screens should ask which stage first —
//                  the case for someone looking at a split school as a whole.
export const useAdminScope = () => {
  return useMemo(() => {
    let user = {};
    try {
      user = JSON.parse(localStorage.getItem("userInfo") || "{}");
    } catch {
      user = {};
    }

    const ownStages = user.managedStages || [];
    const oversightOnly = Boolean(user.oversightOnly);

    return {
      user,
      canEdit: !oversightOnly,
      oversightOnly,
      ownStages,
      browsesByStage: oversightOnly,
    };
  }, []);
};

export default useAdminScope;
