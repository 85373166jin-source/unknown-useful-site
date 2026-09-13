export type LoginSignal = { ipHash: string; country: string; city: string; at: number };
export type RiskLevel = 'none' | 'warn' | 'strong_warn';

export function classifyLoginRisk(events: LoginSignal[]): RiskLevel {
  const distinctIps = new Set(events.map((event) => event.ipHash)).size;
  const distinctCountries = new Set(events.map((event) => event.country)).size;
  if (distinctIps >= 5 || distinctCountries > 1) return 'strong_warn';
  if (distinctIps >= 3) return 'warn';
  return 'none';
}
