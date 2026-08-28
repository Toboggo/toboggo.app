/**
 * Real Open-Meteo integration (free, no API key) — the prototype had this
 * exact plan spec'd in code comments but never implemented it; wiring it for
 * real here since it costs nothing.
 */
export type WeatherCondition = "clear" | "heat" | "rain" | "wind" | "cloudy";

export interface WeatherReading {
  condition: WeatherCondition;
  temperatureC: number;
}

// WMO weather codes: https://open-meteo.com/en/docs
function codeToCondition(code: number, windKmh: number, tempC: number): WeatherCondition {
  if (windKmh >= 40) return "wind";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  if (tempC >= 30) return "heat";
  if ([1, 2, 3, 45, 48].includes(code)) return "cloudy";
  return "clear";
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherReading> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Météo indisponible");
  const json = await res.json();
  const temperatureC = json.current.temperature_2m as number;
  const condition = codeToCondition(json.current.weather_code, json.current.wind_speed_10m, temperatureC);
  return { condition, temperatureC };
}

export const WEATHER_ALERT_COPY: Record<"heat" | "rain" | "wind", { message: string; actionLabel: string }> = {
  heat: {
    message: "Forte chaleur aujourd'hui — préférez un parc ombragé pour la sortie.",
    actionLabel: "Voir les parcs ombragés",
  },
  rain: {
    message: "Pluie prévue cet après-midi — mieux vaut un parc proche de chez vous.",
    actionLabel: "Trier par proximité",
  },
  wind: {
    message: "Vent fort annoncé — vérifiez que le parc est bien clôturé.",
    actionLabel: "Voir les parcs clôturés",
  },
};
