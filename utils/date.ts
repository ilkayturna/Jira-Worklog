// Helper: Local date string (YYYY-MM-DD)
export const toLocalDateStr = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Helper: Haftanın Pazartesi gününü bul
export const getWeekMonday = (dateStr: string): string => {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return toLocalDateStr(monday);
};

// Helper: Haftanın tüm günlerini al (Pazartesi-Pazar)
export const getWeekDays = (dateStr: string): string[] => {
  const monday = getWeekMonday(dateStr);
  const mondayDate = new Date(monday);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(mondayDate);
    day.setDate(mondayDate.getDate() + i);
    days.push(toLocalDateStr(day));
  }
  return days;
};
