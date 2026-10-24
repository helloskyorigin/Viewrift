import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

export function normalizedUrl(raw: string): string {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) throw new Error("Enter a valid website URL.");
  const initial = raw.trim();
  if (/^[a-zA-Z][\w+.-]*:/.test(initial) && !/^https?:\/\//i.test(initial)) throw new Error("Only HTTP and HTTPS websites are supported.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(initial) ? initial : `https://${initial}`); }
  catch { throw new Error("Enter a valid website URL."); }
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (!url.hostname || url.hostname.endsWith(".local") || !url.hostname.includes(".")) {
    throw new Error("Enter a public website domain, not a local address.");
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") || host === "metadata.google.internal") throw new Error("Local and private network addresses are blocked.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard web ports are supported.");
  url.hash = "";
  return url.toString();
}

export function isPublicIP(ip: string): boolean {
  try {
    let address = ipaddr.parse(ip);
    if (address.kind() === "ipv6" && (address as ipaddr.IPv6).isIPv4MappedAddress()) {
      address = (address as ipaddr.IPv6).toIPv4Address();
    }
    if (address.range() !== "unicast") return false;
    if (address.kind() === "ipv4") {
      const v = (address as ipaddr.IPv4).octets;
      if (v[0] === 0 || v[0] >= 224 || (v[0] === 100 && v[1] >= 64 && v[1] <= 127) || (v[0] === 192 && v[1] === 0 && v[2] === 0)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Best-effort application validation. For an Internet-facing service, ALSO enforce
// egress firewall/network isolation. DNS can change between validation and connect.
export async function assertPublicTarget(raw: string): Promise<string> {
  const url = normalizedUrl(raw);
  const hostname = new URL(url).hostname.replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".internal") || hostname === "metadata.google.internal") {
    throw new Error("Local and private network addresses are blocked.");
  }
  if (net.isIP(hostname)) {
    if (!isPublicIP(hostname)) throw new Error("Private IP addresses are blocked.");
  } else {
    const addresses = await Promise.race([
      dns.lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS lookup timed out.")), 3500)),
    ]);
    if (!addresses.length || addresses.some(a => !isPublicIP(a.address))) {
      throw new Error("This domain resolves to a private or unsupported address.");
    }
  }
  return url;
}


// Treat retest CSS as untrusted input. Browser fetches must not be initiated from CSS.
export function validateTemporaryCSS(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 3000 || !value.trim()) throw new Error("Invalid CSS patch.");
  if (/@(?!media\b)|url\s*\(|expression\s*\(|image-set\s*\(|-moz-binding|\\[0-9a-f]{1,6}\s?/i.test(value)) throw new Error("CSS patches cannot load external resources or use unsafe directives.");
  if (/[<>]/.test(value) || /[\x00-\x08\x0b\x0e-\x1f]/.test(value)) throw new Error("Unsupported characters in CSS patch.");
  return value;
}
