const pageShell = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: "Segoe UI", system-ui, sans-serif;
      line-height: 1.5;
    }
    body {
      margin: 0;
      background: #0f172a;
      color: #e2e8f0;
    }
    main {
      max-width: 52rem;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 3rem;
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 2rem;
    }
    p {
      margin: 0 0 1rem;
      color: #94a3b8;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      margin-top: 1.5rem;
    }
    ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    li + li {
      margin-top: 0.5rem;
    }
    a {
      color: #38bdf8;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    code {
      background: #0f172a;
      border-radius: 0.25rem;
      padding: 0.1rem 0.35rem;
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;

export const renderLandingPage = (): string =>
  pageShell(
    'PDS-Chain API',
    `<h1>PDS-Chain API</h1>
<p>Blockchain-enabled trust, traceability, and audit layer for India's Public Distribution System.</p>
<div class="card">
  <strong>Quick links</strong>
  <ul>
    <li><a href="/docs">Swagger UI</a> — browse and try API endpoints</li>
    <li><a href="/openapi.json">OpenAPI JSON</a> — machine-readable contract</li>
    <li><a href="/health">Health check</a> — <code>GET /health</code></li>
    <li><a href="/dashboard/summary">Dashboard summary</a> — <code>GET /dashboard/summary</code></li>
  </ul>
</div>
<p>Web dashboard (React UI) runs separately on port <code>4173</code>.</p>`
  );

export const renderSwaggerPage = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDS-Chain API — Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>`;
