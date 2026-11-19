import fs from "node:fs";
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));
for (const name of ["tiktok-us.html", "tiktok-us-reviews-p3.html"]) {
  const file = "extension/tests/fixtures/" + name;
  let text = fs.readFileSync(file, "utf8");
  const replacements = new Map();
  let kept = 0;
  text = text.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_whole, attrs, raw) => {
    if (!/id=["']__MODERN_ROUTER_DATA__["']/.test(attrs)) return "";
    const source = JSON.parse(raw), loaderData = {};
    for (const [route, page] of Object.entries(source.loaderData ?? {})) {
      const components = page?.page_config?.components_map;
      if (!components) continue;
      const list = Array.isArray(components) ? components : Object.values(components);
      const retained = list.flatMap(comp => {
        const data = comp?.component_data ?? {}, clean = {};
        if (data.product_info) {
          const pi = data.product_info;
          clean.product_info = {
            product_model: pick(pi.product_model, ["product_id", "name", "images", "sold_count"]),
            promotion_model: pick(pi.promotion_model, ["promotion_product_price"]),
            review_model: pick(pi.review_model, ["product_overall_score", "product_review_count"]),
            seller_model: pick(pi.seller_model, ["shop_name"]),
          };
        }
        if (data.review_info) {
          const ri = data.review_info;
          clean.review_info = {
            ...pick(ri, ["review_ratings", "total_reviews"]),
            product_reviews: (ri.product_reviews ?? []).map((r,i) => {
              // Preserve synthetic identity fields to keep the no-buyer-identity regression meaningful.
              if (r.reviewer_name) replacements.set(r.reviewer_name, "Sample reviewer");
              if (r.reviewer_avatar_url) replacements.set(r.reviewer_avatar_url, "https://example.invalid/avatar.png");
              return { ...pick(r, ["review_id", "review_text", "review_rating", "review_time", "sku_specification", "is_verified_purchase", "product_name"]),
                reviewer_name: "Sample reviewer", reviewer_id: "fixture-reviewer-" + i, reviewer_avatar_url: "https://example.invalid/avatar.png" };
            }),
          };
        }
        return Object.keys(clean).length ? [{ component_data: clean }] : [];
      });
      if (retained.length) loaderData[route] = { page_config: { components_map: retained } };
    }
    kept++;
    return '<script id="__MODERN_ROUTER_DATA__" type="application/json">' + JSON.stringify({ loaderData }) + "</script>";
  });
  if (kept !== 1) throw new Error("Missing fixture data: " + name);
  for (const [from, to] of replacements) text = text.split(from).join(to);
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[^]*?-->/g, "").replace(/<(?:link|meta)\b[^>]*>/gi, "")
    .replace(/<tiktok-cookie-banner\b[^>]*>[\s\S]*?<\/tiktok-cookie-banner>/gi, "");
  text = text.split("\n").map(line => line.trimEnd()).join("\n");
  fs.writeFileSync(file, text);
  console.log(name + ": retained only parser data and DOM (" + Buffer.byteLength(text) + " bytes)");
}
