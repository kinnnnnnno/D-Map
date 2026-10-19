import { useEffect, useState } from "react";
import { getTodayJst } from "../lib/calendar";
export function useTodayJst(): string {
  const [today, setToday] = useState(getTodayJst);
  useEffect(() => {
    const refresh = () => setToday(getTodayJst());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
