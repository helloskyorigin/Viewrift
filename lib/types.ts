export type Device = {
  id: "android" | "iphone" | "tablet" | "laptop" | "desktop";
  label: string;
  width: number;
  height: number;
  family: "mobile" | "tablet" | "desktop";
};
export const DEVICES: Device[] = [
  { id: "android", label: "Android", width: 360, height: 800, family: "mobile" },
  { id: "iphone", label: "iPhone", width: 390, height: 844, family: "mobile" },
  { id: "tablet", label: "Tablet", width: 768, height: 1024, family: "tablet" },
  { id: "laptop", label: "Laptop", width: 1366, height: 768, family: "desktop" },
  { id: "desktop", label: "Desktop", width: 1920, height: 1080, family: "desktop" },
];
export type Issue = {
  id: string;
  type: "horizontal-overflow" | "element-overflow" | "overlap" | "broken-image";
  severity: "high" | "medium";
  title: string;
  description: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number } | null;
  suggestion: string;
  css: string;
  ai?: boolean;
};
export type DeviceDiagnostics = {
  title: string;
  documentWidth: number;
  overflowPixels: number;
  elementsInspected: number;
  interactiveElements: number;
  imagesFound: number;
  imagesBroken: number;
};
export type DeviceResult = {
  device: Device;
  status: "pass" | "issues" | "error";
  issues: Issue[];
  screenshot: string | null;
  diagnostics?: DeviceDiagnostics;
  finalUrl?: string;
  loadMs?: number;
  error?: string;
};
export type StreamEvent =
  | { type: "start"; url: string }
  | { type: "device_start"; deviceId: Device["id"] }
  | { type: "device_result"; result: DeviceResult }
  | { type: "issue_enriched"; deviceId: Device["id"]; issue: Issue }
  | { type: "error"; message: string }
  | { type: "done" };
