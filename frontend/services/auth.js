// frontend/services/auth.js
// Uses the same base URL logic as services/api.js (supports localStorage override).
import { resolveApiBase } from "./api.js";

async function authBase() {
  const base = await resolveApiBase();
  return `${base}/api/auth`;
}

async function readBody(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function pickErrorMessage(body, fallback) {
  return body?.message || body?.error || fallback;
}

export function getSession() {
  const token = localStorage.getItem("token");
  const userRaw = localStorage.getItem("user");
  let user = null;
  try { user = userRaw ? JSON.parse(userRaw) : null; } catch {}
  return { token, user };
}

export function getToken() {
  return localStorage.getItem("token");
}

export async function login({ email, password } = {}) {
  if (!email || !password) throw new Error("Email and password are required.");

  const base = await authBase();

  let res;
  try {
    res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error(`API not reachable. Make sure backend is running (port 5000).`);
  }

  const body = await readBody(res);
  if (!res.ok) throw new Error(pickErrorMessage(body, "Login failed."));

  // backend returns { message, user, token } :contentReference[oaicite:4]{index=4}
  localStorage.setItem("token", body.token);
  localStorage.setItem("user", JSON.stringify(body.user));
  return body;
}

export async function register({ username, email, password, userType = "Registered" } = {}) {
  if (!username || !email || !password) throw new Error("Username, email, and password are required.");

  const base = await authBase();

  let res;
  try {
    res = await fetch(`${base}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, userType }),
    });
  } catch {
    throw new Error(`API not reachable. Make sure backend is running (port 5000).`);
  }

  const body = await readBody(res);
  if (!res.ok) throw new Error(pickErrorMessage(body, "Registration failed."));

  // if your backend returns token+user on register, store it; otherwise just return body
  if (body.token && body.user) {
    localStorage.setItem("token", body.token);
    localStorage.setItem("user", JSON.stringify(body.user));
  }
  return body;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
