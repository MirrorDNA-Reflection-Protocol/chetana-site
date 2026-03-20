export type PageId =
  | "home"
  | "consumer"
  | "merchant"
  | "nexus"
  | "weather"
  | "atlas"
  | "trust"
  | "proof"
  | "vigilance"
  | "story"
  | "panic";

export interface ThreatEntry {
  id: string;
  title: string;
  surface: string;
  status: "active" | "rising" | "watch" | "cooling";
  summary: string;
  firstSeen: string;
  lastSeen: string;
  languages: string[];
  redFlags: string[];
  actions: string[];
}

export interface WeatherSignal {
  id: string;
  label: string;
  pressure: number;
  delta: string;
  tone: "red" | "amber" | "green" | "violet";
}

export interface GraphNode { data: { id: string; label: string; kind: string; score?: number; }; }
export interface GraphEdge { data: { id: string; source: string; target: string; label?: string; weight?: number; }; }

export interface ScanResult {
  verdict: string;
  risk_score: number;
  surface: string;
  why_flagged: string[];
  action_eligibility: string;
  engine?: string;
}
