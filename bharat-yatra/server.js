#!/usr/bin/env node
/* ==========================================================================
   BHARAT YATRA — back end
   A single file, no dependencies. It does two things:

     1. serves the app out of ./public
     2. proxies anything else to https://api.sarvam.ai, adding your key

   The key lives here, in the server's environment, and never reaches the
   browser. That is the whole point: a page can be published and shared
   without handing anyone your Sarvam credentials.

   Run:  SARVAM_API_KEY=sk_... node server.js
   Then open http://localhost:8787
========================================================================== */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.SARVAM_API_KEY || "";
const UPSTREAM = "https://api.sarvam.ai";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp",
  ".svg":"image/svg+xml", ".ico":"image/x-icon", ".woff2":"font/woff2", ".txt":"text/plain; charset=utf-8",
  ".pdf":"application/pdf", ".webmanifest":"application/manifest+json"
};

function cors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, api-subscription-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJSON(res, code, obj){
  cors(res);
  res.writeHead(code, {"Content-Type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(obj));
}

/* --------------------------------------------------------------- static */
function serveStatic(req, res, pathname){
  let rel = decodeURIComponent(pathname);
  if(rel === "/" || rel === "") rel = "/index.html";
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ""));
  if(!file.startsWith(PUBLIC_DIR)){ sendJSON(res, 403, {error:"forbidden"}); return true; }

  let stat;
  try{ stat = fs.statSync(file); }catch(e){ return false; }
  if(stat.isDirectory()) return false;

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

/* only these paths are forwarded to Sarvam — everything else is a 404, so a
   stray path can never be turned into an upstream request */
const API_PREFIXES = ["/v1/","/v2/","/translate","/transliterate","/text-lid","/text-to-speech",
                      "/speech-to-text","/doc-ai/","/models","/api/"];

function isApiPath(p){
  return API_PREFIXES.some(pre=>p === pre.replace(/\/$/,"") || p.startsWith(pre));
}

/* ---------------------------------------------------------------- proxy */
function proxy(req, res, pathname, search){
  if(!KEY){ sendJSON(res, 500, {error:{message:"SARVAM_API_KEY is not set on the server"}}); return; }

  /* accept both /v1/... and /api/v1/... */
  let upstreamPath = pathname.startsWith("/api/") ? pathname.slice(4) : pathname;

  const headers = Object.assign({}, req.headers);
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  delete headers["content-length"];
  headers["api-subscription-key"] = KEY;      /* the key is added here, never in the browser */
  headers.host = "api.sarvam.ai";

  const target = new URL(UPSTREAM + upstreamPath + (search || ""));

  const up = https.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers
  }, (upRes)=>{
    cors(res);
    const h = Object.assign({}, upRes.headers);
    delete h["content-encoding"];             /* we are not re-compressing */
    delete h["access-control-allow-origin"];
    res.writeHead(upRes.statusCode || 502, h);
    upRes.pipe(res);
  });

  up.on("error", (err)=>{
    if(res.headersSent){ try{ res.end(); }catch(e){} return; }
    sendJSON(res, 502, {error:{message:"upstream failed: " + err.message}});
  });

  req.pipe(up);
}

/* --------------------------------------------------------------- router */
function handler(req, res){
  if(req.method === "OPTIONS"){ cors(res); res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if(p === "/health"){
    sendJSON(res, 200, {ok:true, key: KEY ? "set" : "missing", upstream: UPSTREAM});
    return;
  }

  if(req.method === "GET" && serveStatic(req, res, p)) return;

  if(!isApiPath(p)){ sendJSON(res, 404, {error:{message:"not found: " + p}}); return; }

  proxy(req, res, p, url.search);
}

if(require.main === module){
  http.createServer(handler).listen(PORT, ()=>{
    console.log("Bharat Yatra running on http://localhost:" + PORT);
    console.log("key: " + (KEY ? "loaded from environment" : "MISSING — set SARVAM_API_KEY"));
  });
}

module.exports = { handler };
