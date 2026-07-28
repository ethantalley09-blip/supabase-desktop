const MAX_COMMON_REASONS = 5;
export function buildAskRehearsalSnapshot(warmDoors) {
    if (warmDoors.length === 0)
        return null;
    const counts = new Map();
    for (const door of warmDoors) {
        for (const reason of door.reasons) {
            counts.set(reason, (counts.get(reason) ?? 0) + 1);
        }
    }
    const commonReasons = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_COMMON_REASONS)
        .map(([reason]) => reason);
    return { doorCount: warmDoors.length, commonReasons };
}
