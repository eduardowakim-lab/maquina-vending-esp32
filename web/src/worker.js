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

function promoteBrickCheckout(path, text) {
  if (path === "/") {
    return text.replace("<div class=\"brand\">NOVO PAGAMENTO</div>", "<div class=\"brand\">PAGAMENTO</div>");
  }

  if (path !== "/app.js") return text;

  const oldButtons = 'const button=document.createElement("button");button.type="button";button.textContent="Comprar agora";button.addEventListener("click",()=>startCheckout(item,button));const newButton=document.createElement("button");newButton.type="button";newButton.className="new-payment";newButton.textContent="Novo pagamento (teste)";newButton.addEventListener("click",()=>startBrick(item,newButton));card.append(visual,title,price,button,newButton);container.append(card)';
  const primaryButton = 'const button=document.createElement("button");button.type="button";button.textContent="Comprar agora";button.addEventListener("click",()=>startBrick(item,button));card.append(visual,title,price,button);container.append(card)';

  return text.replace(oldButtons, primaryButton);
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    const path = new URL(request.url).pathname;

    headers.set("Content-Security-Policy", BRICK_CSP);

    if (path === "/" || path === "/styles.css" || path === "/app.js") {
      headers.set("Cache-Control", "no-store, max-age=0");
    }

    if ((path === "/" || path === "/app.js") && response.ok) {
      const text = await response.text();
      return new Response(promoteBrickCheckout(path, text), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
