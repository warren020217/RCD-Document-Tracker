
const RCD_API =
  process.env.RCD_APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbzXUw5_w_YlCDEHgW0zysoyRDdADF01yK-n7pHpKqv4f8kBFk82O9PXPLn_8GrsJqsMlg/exec";

module.exports = async function handler(req, res) {
  try {
    const incoming = req.query || {};
    const target = new URL(RCD_API);

    for (const [key, value] of Object.entries(incoming)) {
      if (Array.isArray(value)) {
        if (value.length) target.searchParams.set(key, String(value[0]));
      } else if (value !== undefined && value !== null) {
        target.searchParams.set(key, String(value));
      }
    }

    // Never forward JSONP callbacks through the proxy.
    target.searchParams.delete("callback");

    const upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "Accept": "application/json,text/plain,*/*",
        "User-Agent": "PRO4A-RCD-Document-Tracker/1.0"
      }
    });

    const text = await upstream.text();

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.ok ? 200 : upstream.status);

    try {
      const data = JSON.parse(text);
      return res.status(upstream.ok ? 200 : upstream.status).json(data);
    } catch (_) {
      return res.status(502).json({
        result: "error",
        error: "The Apps Script API did not return valid JSON.",
        upstreamStatus: upstream.status,
        upstreamPreview: text.slice(0, 300)
      });
    }
  } catch (err) {
    return res.status(502).json({
      result: "error",
      error: "Unable to reach the RCD Apps Script API.",
      details: String(err && err.message ? err.message : err)
    });
  }
};
