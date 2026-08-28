import { useQuery } from "@tanstack/react-query";
import { fetchWeather } from "@toboggo/shared";

export function useWeather(lat: number, lng: number) {
  return useQuery({
    queryKey: ["weather", Math.round(lat * 100), Math.round(lng * 100)],
    queryFn: () => fetchWeather(lat, lng),
    staleTime: 15 * 60_000,
    retry: false,
  });
}
