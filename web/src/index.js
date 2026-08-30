const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 10;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(JSON.stringify({ event: "request_error", message: String(error) }));
      return json({ error: "Erro interno. Tente novamente." }, 500);
    }
  }
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/") return html(PUBLIC_HTML);
  if (request.method === "GET" && path === "/admin") return html(ADMIN_HTML);
  if (request.method === "GET" && path === "/styles.css") return css(STYLES);
  if (request.method === "GET" && path === "/app.js") return javascript(PUBLIC_JS);
  if (request.method === "GET" && path === "/admin.js") return javascript(ADMIN_JS);
  if (request.method === "GET" && path === "/favicon.ico") return new Response(null, { status: 204 });
  if (request.method === "GET" && path === "/api/products") return listPublicProducts(env);
  if (request.method === "GET" && path.startsWith("/images/")) return getProductImage(path, env);

  if (request.method === "POST" && path === "/api/admin/login") {
    requireSameOrigin(request);
    return login(request, env);
  }
  if (request.method === "POST" && path === "/api/admin/logout") {
    requireSameOrigin(request);
    return logout(request, env);
  }
  if (request.method === "GET" && path === "/api/admin/products") {
    await requireAdmin(request, env);
    return listAdminProducts(env);
  }
  if (request.method === "PUT" && path === "/api/admin/products") {
    requireSameOrigin(request);
    await requireAdmin(request, env);
    return updateProducts(request, env);
  }
  if (request.method === "PUT" && path === "/api/admin/password") {
    requireSameOrigin(request);
    const session = await requireAdmin(request, env);
    return updatePassword(request, env, session);
  }
  const testMatch = path.match(/^\/api\/admin\/products\/(1|2)\/test$/);
  if (testMatch && request.method === "POST") {
    requireSameOrigin(request);
    await requireAdmin(request, env);
    return createTestCommand(env, Number(testMatch[1]));
  }
  if (request.method === "GET" && path === "/api/device/commands/next") {
    return nextDeviceCommand(request, env, url.searchParams.get("device_id") || "");
  }
  const completeMatch = path.match(/^\/api\/device\/commands\/(\d+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    return completeDeviceCommand(request, env, url.searchParams.get("device_id") || "", Number(completeMatch[1]));
  }
  const imageMatch = path.match(/^\/api\/admin\/products\/(1|2)\/image$/);
  if (imageMatch && request.method === "POST") {
    requireSameOrigin(request);
    await requireAdmin(request, env);
    return uploadProductImage(request, env, Number(imageMatch[1]));
  }
  if (imageMatch && request.method === "DELETE") {
    requireSameOrigin(request);
    await requireAdmin(request, env);
    return deleteProductImage(env, Number(imageMatch[1]));
  }

  return json({ error: "Nao encontrado." }, 404);
}

async function createTestCommand(env, motor) {
  const deviceId = "machine-1";
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE device_commands SET status = 'expired' WHERE device_id = ? AND status IN ('pending', 'claimed') AND created_at < ?"
  ).bind(deviceId, now - 300).run();
  const active = await env.DB.prepare(
    "SELECT id FROM device_commands WHERE device_id = ? AND status IN ('pending', 'claimed') LIMIT 1"
  ).bind(deviceId).first();
  if (active) throw new HttpError(409, "Ja existe um teste aguardando o ESP32.");
  await env.DB.prepare(
    "INSERT INTO device_commands (device_id, motor, status, created_at) VALUES (?, ?, 'pending', ?)"
  ).bind(deviceId, motor, now).run();
  return json({ ok: true });
}

async function requireDevice(request, env, deviceId) {
  if (!/^[a-z0-9-]{3,40}$/.test(deviceId)) throw new HttpError(401, "Dispositivo invalido.");
  const token = request.headers.get("X-Device-Key") || "";
  if (token.length < 24 || token.length > 128) throw new HttpError(401, "Dispositivo nao autorizado.");
  const device = await env.DB.prepare(
    "SELECT token_hash FROM devices WHERE device_id = ? AND enabled = 1"
  ).bind(deviceId).first();
  if (!device || !constantTimeEqual(await sha256Hex(token), device.token_hash)) {
    throw new HttpError(401, "Dispositivo nao autorizado.");
  }
}

async function nextDeviceCommand(request, env, deviceId) {
  await requireDevice(request, env, deviceId);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE device_commands SET status = 'expired' WHERE device_id = ? AND status IN ('pending', 'claimed') AND created_at < ?"
  ).bind(deviceId, now - 300).run();
  const command = await env.DB.prepare(
    "SELECT id, motor FROM device_commands WHERE device_id = ? AND status = 'pending' ORDER BY id LIMIT 1"
  ).bind(deviceId).first();
  if (!command) return new Response(null, { status: 204, headers: SECURITY_HEADERS });
  const claimed = await env.DB.prepare(
    "UPDATE device_commands SET status = 'claimed', claimed_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(now, command.id).run();
  if (!claimed.meta.changes) return new Response(null, { status: 204, headers: SECURITY_HEADERS });
  return textResponse(`${command.id},${command.motor}`);
}

async function completeDeviceCommand(request, env, deviceId, commandId) {
  await requireDevice(request, env, deviceId);
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "UPDATE device_commands SET status = 'completed', completed_at = ? WHERE id = ? AND device_id = ? AND status = 'claimed'"
  ).bind(now, commandId, deviceId).run();
  if (!result.meta.changes) throw new HttpError(404, "Comando nao encontrado.");
  return json({ ok: true });
}

async function listPublicProducts(env) {
  const result = await env.DB.prepare(
    "SELECT id, name, price_cents, payment_url, image_key FROM products WHERE enabled = 1 ORDER BY id"
  ).all();
  return json({ products: result.results.map(withImageUrl) });
}

async function listAdminProducts(env) {
  const result = await env.DB.prepare(
    "SELECT id, name, price_cents, payment_url, enabled, image_key FROM products ORDER BY id"
  ).all();
  return json({ products: result.results.map(withImageUrl) });
}

function withImageUrl(product) {
  return { ...product, image_url: product.image_key ? `/images/${encodeURIComponent(product.image_key)}` : "" };
}

async function getProductImage(path, env) {
  let key;
  try {
    key = decodeURIComponent(path.slice("/images/".length));
  } catch {
    return new Response(null, { status: 404, headers: SECURITY_HEADERS });
  }
  if (!/^product-(1|2)-[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) {
    return new Response(null, { status: 404, headers: SECURITY_HEADERS });
  }
  const object = await env.PRODUCT_IMAGES.get(key, "stream");
  if (!object) return new Response(null, { status: 404, headers: SECURITY_HEADERS });
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", imageContentType(key));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object, { headers });
}

function imageContentType(key) {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "image/webp";
}

async function uploadProductImage(request, env, productId) {
  const type = (request.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
  const extension = IMAGE_TYPES.get(type);
  if (!extension) throw new HttpError(415, "Use uma foto JPG, PNG ou WEBP.");
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_IMAGE_BYTES) throw new HttpError(413, "A foto deve ter no maximo 2 MB.");
  if (!request.body) throw new HttpError(400, "Foto vazia.");

  const image = await request.arrayBuffer();
  if (!image.byteLength || image.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "A foto deve ter no maximo 2 MB.");
  }
  if (!hasValidImageSignature(new Uint8Array(image), type)) {
    throw new HttpError(415, "O arquivo nao corresponde a uma foto valida.");
  }

  const current = await env.DB.prepare("SELECT image_key FROM products WHERE id = ?").bind(productId).first();
  if (!current) throw new HttpError(404, "Produto nao encontrado.");
  const key = `product-${productId}-${crypto.randomUUID()}.${extension}`;
  await env.PRODUCT_IMAGES.put(key, image);
  try {
    await env.DB.prepare("UPDATE products SET image_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(key, productId).run();
  } catch (error) {
    await env.PRODUCT_IMAGES.delete(key);
    throw error;
  }
  if (current.image_key) await env.PRODUCT_IMAGES.delete(current.image_key);
  return json({ ok: true, image_url: `/images/${encodeURIComponent(key)}` });
}

function hasValidImageSignature(bytes, type) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (type === "image/webp") return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return false;
}

async function deleteProductImage(env, productId) {
  const current = await env.DB.prepare("SELECT image_key FROM products WHERE id = ?").bind(productId).first();
  if (!current) throw new HttpError(404, "Produto nao encontrado.");
  await env.DB.prepare("UPDATE products SET image_key = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(productId).run();
  if (current.image_key) await env.PRODUCT_IMAGES.delete(current.image_key);
  return json({ ok: true });
}

async function login(request, env) {
  const body = await readJson(request);
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 6 || password.length > 128) return json({ error: "Senha invalida." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256Hex(ip);
  const now = Math.floor(Date.now() / 1000);
  const attempt = await env.DB.prepare(
    "SELECT attempts, window_started FROM login_attempts WHERE ip_hash = ?"
  ).bind(ipHash).first();

  if (attempt && now - attempt.window_started < LOGIN_WINDOW_SECONDS && attempt.attempts >= LOGIN_MAX_ATTEMPTS) {
    return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
  }

  const credentials = await env.DB.prepare(
    "SELECT salt, password_hash, iterations FROM admin_credentials WHERE id = 1"
  ).first();
  if (!credentials) return json({ error: "Administrador ainda nao configurado." }, 503);

  const valid = await verifyPassword(password, credentials);
  if (!valid) {
    if (!attempt || now - attempt.window_started >= LOGIN_WINDOW_SECONDS) {
      await env.DB.prepare(
        "INSERT INTO login_attempts (ip_hash, attempts, window_started) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts = 1, window_started = excluded.window_started"
      ).bind(ipHash, now).run();
    } else {
      await env.DB.prepare("UPDATE login_attempts SET attempts = attempts + 1 WHERE ip_hash = ?")
        .bind(ipHash).run();
    }
    return json({ error: "Senha incorreta." }, 401);
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").bind(ipHash),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO admin_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)")
      .bind(tokenHash, now + SESSION_SECONDS, now)
  ]);

  return json({ ok: true }, 200, {
    "Set-Cookie": sessionCookie(rawToken, SESSION_SECONDS)
  });
}

async function logout(request, env) {
  const token = getCookie(request, "admin_session");
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function requireAdmin(request, env) {
  const token = getCookie(request, "admin_session");
  if (!token) throw new HttpError(401, "Login necessario.");
  const tokenHash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    "SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?"
  ).bind(tokenHash, now).first();
  if (!session) throw new HttpError(401, "Sessao expirada.");
  return session;
}

async function updateProducts(request, env) {
  const body = await readJson(request);
  if (!Array.isArray(body.products) || body.products.length !== 2) {
    return json({ error: "Envie exatamente dois produtos." }, 400);
  }

  const seen = new Set();
  const statements = [];
  for (const product of body.products) {
    const id = Number(product.id);
    const name = typeof product.name === "string" ? product.name.trim() : "";
    const priceCents = Number(product.price_cents);
    const paymentUrl = typeof product.payment_url === "string" ? product.payment_url.trim() : "";
    const enabled = product.enabled === true ? 1 : 0;

    if (![1, 2].includes(id) || seen.has(id)) return json({ error: "Produto invalido." }, 400);
    if (name.length < 1 || name.length > 60) return json({ error: "Nome deve ter entre 1 e 60 caracteres." }, 400);
    if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 1000000) {
      return json({ error: "Preco invalido." }, 400);
    }
    if (paymentUrl && !isAllowedPaymentUrl(paymentUrl)) {
      return json({ error: "Use um link HTTPS oficial do Mercado Pago." }, 400);
    }

    seen.add(id);
    statements.push(env.DB.prepare(
      "UPDATE products SET name = ?, price_cents = ?, payment_url = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(name, priceCents, paymentUrl, enabled, id));
  }

  await env.DB.batch(statements);
  return json({ ok: true });
}

async function updatePassword(request, env, session) {
  const body = await readJson(request);
  const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
  const newPassword = typeof body.new_password === "string" ? body.new_password : "";
  if (newPassword.length < 6 || newPassword.length > 128) {
    return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
  }

  const credentials = await env.DB.prepare(
    "SELECT salt, password_hash, iterations FROM admin_credentials WHERE id = 1"
  ).first();
  if (!credentials || !(await verifyPassword(currentPassword, credentials))) {
    return json({ error: "Senha atual incorreta." }, 401);
  }

  const salt = randomToken(16);
  // Mantido baixo o bastante para o limite de CPU do Workers Free.
  // A senha inicial tem alta entropia e o login possui rate limiting.
  const iterations = 10000;
  const passwordHash = await pbkdf2Hex(newPassword, salt, iterations);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE admin_credentials SET salt = ?, password_hash = ?, iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
    ).bind(salt, passwordHash, iterations),
    env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash <> ?").bind(session.token_hash)
  ]);
  return json({ ok: true });
}

function isAllowedPaymentUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "mpago.la" || host === "mercadopago.com.br" || host.endsWith(".mercadopago.com.br") || host === "mercadopago.com" || host.endsWith(".mercadopago.com");
  } catch {
    return false;
  }
}

function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, "Origem invalida.");
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 20000) throw new HttpError(413, "Conteudo muito grande.");
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Use JSON.");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "JSON invalido.");
  }
}

async function verifyPassword(password, credentials) {
  const candidate = await pbkdf2Hex(password, credentials.salt, Number(credentials.iterations));
  return constantTimeEqual(candidate, credentials.password_hash);
}

async function pbkdf2Hex(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    material,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function sha256Hex(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(hash));
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return "";
}

function sessionCookie(token, maxAge) {
  return `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

function html(body) {
  return new Response(body, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function css(body) {
  return new Response(body, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

function javascript(body) {
  return new Response(body, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

function textResponse(body) {
  return new Response(body, { headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PUBLIC_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Escolha seu produto</title><link rel="stylesheet" href="/styles.css"></head>
<body><main class="shell"><header class="hero"><div class="brand">COMPRA R&Aacute;PIDA</div><h1>Escolha seu produto</h1><p>Selecione uma op&ccedil;&atilde;o para continuar ao pagamento seguro.</p></header>
<section id="products" class="products" aria-live="polite"><div class="loading">Carregando produtos...</div></section>
<p class="secure">&#128274; Pagamento processado pelo Mercado Pago</p></main><script src="/app.js?v=2" defer></script></body></html>`;

const ADMIN_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Administra&ccedil;&atilde;o da m&aacute;quina</title><link rel="stylesheet" href="/styles.css"></head>
<body><main class="shell admin-shell"><header class="hero compact"><div class="brand">ADMINISTRA&Ccedil;&Atilde;O</div><h1>Produtos da m&aacute;quina</h1><p>Altere produtos e envie testes para o ESP32 conectado.</p></header>
<section id="login-panel" class="panel"><h2>Entrar</h2><form id="login-form"><label>Senha<input id="login-password" type="password" autocomplete="current-password" required minlength="6"></label><button type="submit">Entrar</button></form></section>
<section id="admin-panel" class="panel hidden"><form id="products-form"><div id="admin-products"></div><button type="submit">Salvar produtos</button></form><hr><h2>Trocar senha</h2><form id="password-form"><label>Senha atual<input id="current-password" type="password" autocomplete="current-password" required></label><label>Nova senha (m&iacute;nimo 6 caracteres)<input id="new-password" type="password" autocomplete="new-password" minlength="6" required></label><button class="secondary" type="submit">Alterar senha</button></form><button id="logout" class="link-button" type="button">Sair</button></section>
<div id="message" class="message hidden" role="status"></div></main><script src="/admin.js?v=3" defer></script></body></html>`;

const STYLES = `:root{color-scheme:light;--ink:#182026;--muted:#657078;--paper:#fffdf8;--accent:#00a650;--accent-dark:#087a42;--line:#e7e2d8;--shadow:0 18px 50px rgba(30,35,32,.12)}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 0,#dcffe9 0,transparent 34%),linear-gradient(145deg,#f7f4ec,#eef7f0);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}.shell{width:min(980px,calc(100% - 32px));margin:auto;padding:54px 0 32px}.hero{text-align:center;margin-bottom:34px}.hero.compact{margin-bottom:24px}.brand{display:inline-block;padding:7px 12px;border:1px solid #a7dcb9;border-radius:999px;color:var(--accent-dark);font-size:.76rem;font-weight:800;letter-spacing:.14em}.hero h1{font-size:clamp(2.1rem,7vw,4.2rem);line-height:.98;margin:18px 0 13px;letter-spacing:-.055em}.compact h1{font-size:clamp(2rem,6vw,3.3rem)}.hero p{color:var(--muted);font-size:1.06rem;margin:0}.products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.product,.panel{background:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.9);border-radius:26px;box-shadow:var(--shadow);backdrop-filter:blur(10px)}.product{padding:28px;display:flex;flex-direction:column;min-height:310px}.product-number{width:58px;height:58px;border-radius:18px;background:#e8fff0;display:grid;place-items:center;color:var(--accent-dark);font-weight:900;font-size:1.5rem}.product-image{width:100%;height:190px;object-fit:cover;border-radius:18px;background:#eef2ef}.product h2{font-size:1.65rem;margin:26px 0 6px}.price{font-size:2.25rem;font-weight:900;letter-spacing:-.04em;margin:auto 0 20px}.product button,form button{border:0;border-radius:15px;background:var(--accent);color:white;font:inherit;font-weight:800;padding:15px 18px;cursor:pointer;transition:.2s transform,.2s background}.product button:hover,form button:hover{background:var(--accent-dark);transform:translateY(-1px)}button:disabled{background:#b9c0bc;cursor:not-allowed;transform:none}.secure{text-align:center;color:var(--muted);font-size:.9rem;margin:24px 0}.loading,.empty{grid-column:1/-1;text-align:center;padding:50px;color:var(--muted)}.admin-shell{max-width:760px}.panel{padding:26px}.hidden{display:none!important}form{display:grid;gap:16px}label{display:grid;gap:7px;font-weight:700;font-size:.92rem}input{width:100%;border:1px solid var(--line);border-radius:12px;background:white;padding:13px 14px;font:inherit;color:var(--ink)}input:focus{outline:3px solid rgba(0,166,80,.16);border-color:var(--accent)}.admin-product{padding:20px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr 150px;gap:14px}.admin-product:first-child{padding-top:0}.admin-product:last-child{border-bottom:0}.full{grid-column:1/-1}.check{display:flex;align-items:center;gap:9px}.check input{width:auto}.photo-row{display:flex;align-items:center;gap:12px}.photo-preview{width:76px;height:76px;object-fit:cover;border-radius:12px;background:#eef2ef}.remove-photo{border:0;background:transparent;color:#a12424;text-decoration:underline;cursor:pointer}.hint{color:var(--muted);font-size:.8rem;font-weight:500}.panel hr{border:0;border-top:1px solid var(--line);margin:28px 0}.secondary{background:#24302a}.link-button{margin-top:20px;background:transparent;border:0;color:var(--muted);text-decoration:underline;cursor:pointer}.message{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#182026;color:white;border-radius:12px;padding:12px 18px;box-shadow:var(--shadow)}@media(max-width:650px){.shell{padding-top:34px}.products{grid-template-columns:1fr}.product{min-height:255px}.admin-product{grid-template-columns:1fr}}`;

const PUBLIC_JS = `const container=document.querySelector("#products");const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});async function load(){try{const response=await fetch("/api/products",{headers:{Accept:"application/json"}});if(!response.ok)throw new Error();const data=await response.json();container.replaceChildren();if(!data.products.length){container.innerHTML='<div class="empty">Nenhum produto dispon\\u00edvel.</div>';return}for(const item of data.products){const card=document.createElement("article");card.className="product";let visual;if(item.image_url){visual=document.createElement("img");visual.className="product-image";visual.src=item.image_url;visual.alt=item.name;visual.loading="lazy"}else{visual=document.createElement("div");visual.className="product-number";visual.textContent=item.id}const title=document.createElement("h2");title.textContent=item.name;const price=document.createElement("div");price.className="price";price.textContent=money.format(item.price_cents/100);const button=document.createElement("button");button.type="button";button.textContent=item.payment_url?"Comprar agora":"Pagamento em configura\\u00e7\\u00e3o";button.disabled=!item.payment_url;if(item.payment_url)button.addEventListener("click",()=>location.assign(item.payment_url));card.append(visual,title,price,button);container.append(card)}}catch{container.innerHTML='<div class="empty">N\\u00e3o foi poss\\u00edvel carregar os produtos. Tente novamente.</div>'}}load();`;

const ADMIN_JS = `const loginPanel=document.querySelector("#login-panel");const adminPanel=document.querySelector("#admin-panel");const message=document.querySelector("#message");const productsRoot=document.querySelector("#admin-products");function notify(text){message.textContent=text;message.classList.remove("hidden");setTimeout(()=>message.classList.add("hidden"),3500)}async function api(path,options={}){const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Erro inesperado.");return data}function field(label,type,value,cls=""){const wrap=document.createElement("label");if(cls)wrap.className=cls;wrap.append(document.createTextNode(label));const input=document.createElement("input");input.type=type;input.value=value;wrap.append(input);return{wrap,input}}async function uploadPhoto(box){const file=box.querySelector('[data-field="photo"]').files[0];if(!file)return;const response=await fetch('/api/admin/products/'+box.dataset.id+'/image',{method:"POST",headers:{"Content-Type":file.type},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error||"Erro ao enviar foto.")}async function loadAdmin(){try{const data=await api("/api/admin/products");loginPanel.classList.add("hidden");adminPanel.classList.remove("hidden");productsRoot.replaceChildren();for(const product of data.products){const box=document.createElement("section");box.className="admin-product";box.dataset.id=product.id;const name=field("Nome","text",product.name);name.input.dataset.field="name";name.input.maxLength=60;const price=field("Preco (R$)","number",(product.price_cents/100).toFixed(2));price.input.dataset.field="price";price.input.min="0.01";price.input.step="0.01";const link=field("Link de pagamento Mercado Pago","url",product.payment_url,"full");link.input.dataset.field="url";link.input.placeholder="https://mpago.la/...";const photo=field("Foto do produto (JPG, PNG ou WEBP, ate 2 MB)","file","","full");photo.input.dataset.field="photo";photo.input.accept="image/jpeg,image/png,image/webp";const enabled=document.createElement("label");enabled.className="check full";const check=document.createElement("input");check.type="checkbox";check.checked=Boolean(product.enabled);check.dataset.field="enabled";enabled.append(check,document.createTextNode("Produto disponivel"));box.append(name.wrap,price.wrap,link.wrap);if(product.image_url){const row=document.createElement("div");row.className="photo-row full";const preview=document.createElement("img");preview.className="photo-preview";preview.src=product.image_url;preview.alt="Foto atual";const remove=document.createElement("button");remove.type="button";remove.className="remove-photo";remove.textContent="Remover foto";remove.addEventListener("click",async()=>{try{await api('/api/admin/products/'+product.id+'/image',{method:"DELETE",body:"{}"});await loadAdmin();notify("Foto removida.")}catch(error){notify(error.message)}});row.append(preview,remove);box.append(row)}const test=document.createElement("button");test.type="button";test.className="secondary full";test.textContent="Testar motor "+product.id;test.addEventListener("click",async()=>{test.disabled=true;try{await api('/api/admin/products/'+product.id+'/test',{method:"POST",body:"{}"});notify("Teste enviado. O ESP32 deve responder em ate 3 segundos.")}catch(error){notify(error.message)}finally{test.disabled=false}});box.append(photo.wrap,enabled,test);productsRoot.append(box)}}catch{loginPanel.classList.remove("hidden");adminPanel.classList.add("hidden")}}document.querySelector("#login-form").addEventListener("submit",async event=>{event.preventDefault();try{await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:document.querySelector("#login-password").value})});document.querySelector("#login-password").value="";await loadAdmin();notify("Login realizado.")}catch(error){notify(error.message)}});document.querySelector("#products-form").addEventListener("submit",async event=>{event.preventDefault();const boxes=[...document.querySelectorAll(".admin-product")];const products=boxes.map(box=>({id:Number(box.dataset.id),name:box.querySelector('[data-field="name"]').value,price_cents:Math.round(Number(box.querySelector('[data-field="price"]').value)*100),payment_url:box.querySelector('[data-field="url"]').value,enabled:box.querySelector('[data-field="enabled"]').checked}));try{await api("/api/admin/products",{method:"PUT",body:JSON.stringify({products})});for(const box of boxes)await uploadPhoto(box);await loadAdmin();notify("Produtos e fotos salvos.")}catch(error){notify(error.message)}});document.querySelector("#password-form").addEventListener("submit",async event=>{event.preventDefault();try{await api("/api/admin/password",{method:"PUT",body:JSON.stringify({current_password:document.querySelector("#current-password").value,new_password:document.querySelector("#new-password").value})});event.target.reset();notify("Senha alterada.")}catch(error){notify(error.message)}});document.querySelector("#logout").addEventListener("click",async()=>{await api("/api/admin/logout",{method:"POST",body:"{}"});location.reload()});loadAdmin();`;
