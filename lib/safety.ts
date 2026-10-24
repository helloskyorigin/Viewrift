import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

export function normalizedUrl(raw: string): string {
  if (!raw || raw.length > 2048) throw new Error("Enter a valid website URL.");
  const initial = raw.trim();
  const url = new URL(/^https?:\/\//i.test(initial) ? initial : `https://${initial}`);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (!url.hostname || url.hostname.endsWith(".local") || !url.hostname.includes(".")) {
    throw new Error("Enter a public website domain, not a local address.");
  }
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
    return address.range() === "unicast";
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
