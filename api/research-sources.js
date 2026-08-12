const { cors } = require("./_lib");

function clean(value, max = 500) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function authorsFromCrossref(item) {
  return (item.author || [])
    .slice(0, 6)
    .map(author => {
      const given = clean(author.given, 120);
      const family = clean(author.family, 120);
      return [given, family].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "QTRC+ Research Assistant/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Source provider returned ${response.status}.`);
  }

  return response.json();
}

async function searchCrossref(query) {
  const url =
    "https://api.crossref.org/works" +
    "?query.bibliographic=" +
    encodeURIComponent(query) +
    "&rows=6" +
    "&select=DOI,title,author,published,container-title,URL,type,publisher";

  const data = await fetchJson(url);

  return (data?.message?.items || [])
    .slice(0, 6)
    .map(item => ({
      provider: "Crossref",
      type: "journal",
      title:
        Array.isArray(item.title)
          ? clean(item.title[0], 300)
          : clean(item.title, 300),
      authors: authorsFromCrossref(item),
      journal:
        Array.isArray(item["container-title"])
          ? clean(item["container-title"][0], 180)
          : "",
      year:
        item.published?.["date-parts"]?.[0]?.[0] || null,
      doi: clean(item.DOI, 160),
      url: clean(item.URL, 500),
      publisher: clean(item.publisher, 180)
    }))
    .filter(item => item.title);
}

async function searchOpenAlex(query) {
  const url =
    "https://api.openalex.org/works" +
    "?search=" +
    encodeURIComponent(query) +
    "&per-page=6" +
    "&select=id,display_name,authorships,publication_year,primary_location,doi,type";

  const data = await fetchJson(url);

  return (data?.results || [])
    .slice(0, 6)
    .map(item => ({
      provider: "OpenAlex",
      type: "scholarly",
      title: clean(item.display_name, 300),
      authors:
        (item.authorships || [])
          .slice(0, 6)
          .map(a =>
            clean(a?.author?.display_name, 160)
          )
          .filter(Boolean),
      journal:
        clean(
          item?.primary_location?.source?.display_name,
          180
        ),
      year:
        item.publication_year || null,
      doi: clean(item.doi, 160),
      url:
        clean(
          item?.primary_location?.landing_page_url ||
          item?.primary_location?.pdf_url ||
          item.doi ||
          item.id,
          500
        )
    }))
    .filter(item => item.title);
}

module.exports = async (req, res) => {

  cors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const body = req.body || {};

    const query =
      clean(body.query, 500);

    if (!query) {
      return res.status(400).json({
        error: "Search query is required."
      });
    }

    const [crossref, openalex] =
      await Promise.allSettled([
        searchCrossref(query),
        searchOpenAlex(query)
      ]);

    const sources = [];

    if (crossref.status === "fulfilled") {
      sources.push(...crossref.value);
    }

    if (openalex.status === "fulfilled") {
      sources.push(...openalex.value);
    }

    const seen = new Set();

    const deduped =
      sources.filter(item => {

        const key =
          (
            item.doi ||
            item.title ||
            ""
          )
            .toLowerCase()
            .trim();

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;

      }).slice(0, 10);

    return res.status(200).json({
      query,
      sources: deduped,
      providers: {
        crossref:
          crossref.status === "fulfilled",
        openalex:
          openalex.status === "fulfilled"
      }
    });

  } catch (error) {

    return res.status(500).json({
      error:
        error?.message ||
        "Unable to retrieve research sources."
    });

  }
};
