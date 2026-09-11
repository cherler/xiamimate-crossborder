type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

/** Render JSON-LD without allowing a literal "<" to terminate the script tag. */
export function StructuredData({ data }: { data: JsonLdValue }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
