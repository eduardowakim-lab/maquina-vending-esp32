import app from "./index.js";

const BRICK_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.br https://*.mlstatic.com",
  "style-src 'self' 'unsafe-inline' https://*.mercadopago.com https://*.mercadopago.com.br https://*.mlstatic.com",
  "img-src 'self' data: blob: https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com",
  "font-src 'self' data: https://*.mlstatic.com https://*.mercadopago.com https://*.mercadopago.com.br",
  "connect-src 'self' https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com",
  "frame-src https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const headers = new Headers(response.headers);

    // Payment Brick loads scripts, styles, fonts, frames and telemetry from
    // Mercado Pago / Mercado Libre CDN domains. The original CSP was too strict
    // and allowed the shell to open while the actual payment form stayed blank.
    headers.set("Content-Security-Policy", BRICK_CSP);

    // Avoid mixing a new app.js with an older cached styles.css on mobile.
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/styles.css" || path === "/app.js") {
      headers.set("Cache-Control", "no-store, max-age=0");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
