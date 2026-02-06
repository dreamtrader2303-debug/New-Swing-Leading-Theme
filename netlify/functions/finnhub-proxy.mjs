export default async (req) => {
  const url = new URL(req.url);
  const pathAfterPrefix = url.pathname.replace(/^\/api\/finnhub\/?/, "");

  // Route: stock/candle — use Yahoo Finance (free, no API key needed)
  // Finnhub free tier no longer supports /stock/candle, so we proxy
  // through Yahoo Finance's chart API and return Finnhub-compatible format.
  if (pathAfterPrefix === "stock/candle") {
    const symbol = url.searchParams.get("symbol");
    if (!symbol) {
      return new Response(
        JSON.stringify({ s: "no_data", error: "Missing symbol parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
    const response = await fetch(yahooUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ s: "no_data", error: `Yahoo Finance returned ${response.status}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.indicators?.quote?.[0]) {
      return new Response(
        JSON.stringify({ s: "no_data" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const quote = result.indicators.quote[0];
    // Return Finnhub-compatible candle format
    const payload = {
      s: "ok",
      c: quote.close,
      h: quote.high,
      l: quote.low,
      o: quote.open,
      v: quote.volume,
      t: result.timestamp,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Route: quote — use Finnhub free tier (quotes are still free)
  if (pathAfterPrefix === "quote") {
    const apiKey =
      Netlify.env.get("FINNHUB_API_KEY") || process.env.FINNHUB_API_KEY || "";
    const params = new URLSearchParams(url.search);
    if (apiKey) {
      params.set("token", apiKey);
    }
    const finnhubUrl = `https://finnhub.io/api/v1/quote?${params.toString()}`;
    const response = await fetch(finnhubUrl);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fallback: proxy other requests to Finnhub if API key is available
  const apiKey =
    Netlify.env.get("FINNHUB_API_KEY") || process.env.FINNHUB_API_KEY || "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "FINNHUB_API_KEY is not set for this endpoint" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const params = new URLSearchParams(url.search);
  params.set("token", apiKey);
  const finnhubUrl = `https://finnhub.io/api/v1/${pathAfterPrefix}?${params.toString()}`;
  const response = await fetch(finnhubUrl);
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  path: "/api/finnhub/*",
};
