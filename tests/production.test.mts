import test from "node:test";
import assert from "node:assert/strict";
import {normalizedUrl,isPublicIP,validateTemporaryCSS} from "../lib/safety.ts";

test("URL normalization",()=>{
 assert.equal(normalizedUrl("https://example.com/#section"),"https://example.com/");
 assert.equal(normalizedUrl("example.org/path"),"https://example.org/path");
});
test("block unsafe URL protocols and local targets",()=>{
 for(const input of ["localhost:3000","file:///etc/passwd","https://user:pass@example.com","https://example.org:3000","http://metadata.google.internal","ftp://example.org","https://local.test"]) assert.throws(()=>normalizedUrl(input),input);
});
test("reject special-purpose IPs",()=>{
 for(const ip of ["127.0.0.1","169.254.169.254","10.1.2.3","192.168.1.1","100.100.100.100","0.0.0.0","::1","fc00::1","224.0.0.1"]) assert.equal(isPublicIP(ip),false,ip);
 assert.equal(isPublicIP("8.8.8.8"),true);
});
test("CSS retests block resource fetches and risky directives",()=>{
 assert.ok(validateTemporaryCSS("@media (max-width: 390px) { .card { max-width: 100%; } }"));
 for(const input of ["@import 'https://evil.example/file.css';","a{background:url(https://evil.example)}","@font-face {font-family:x}","body{width:expression(alert(1))}","<style>bad</style>",""]) assert.throws(()=>validateTemporaryCSS(input),input);
 assert.equal(validateTemporaryCSS(undefined),undefined);
});
