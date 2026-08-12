const officeParser = require("officeparser");

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 6;

function clean(value, max = 1200) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

async function getAuthenticatedUser(accessToken) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Invalid or expired Supabase session.");
  }

  return response.json();
}

async function readCloudFiles(fileReferences, accessToken) {
  if (!Array.isArray(fileReferences) || !fileReferences.length) {
    return { files: [], text: "" };
  }

  if (!accessToken) {
    throw new Error("Authenticated Supabase session is required for cloud files.");
  }

  const user = await getAuthenticatedUser(accessToken);
  if (!user?.id) throw new Error("Authenticated Supabase user not found.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const results = [];
  const textParts = [];

  for (const ref of fileReferences.slice(0, MAX_FILES)) {
    const bucket = clean(ref.bucket || "qtrc-research", 100);
    const storagePath = clean(ref.storagePath, 1500);

    if (!storagePath || !storagePath.startsWith(`${user.id}/`)) {
      results.push({
        name: clean(ref.name, 240),
        status: "denied",
        message: "File path does not belong to the authenticated user."
      });
      continue;
    }

    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    if (!response.ok) {
      results.push({
        name: clean(ref.name, 240),
        status: "unavailable",
        message: "The cloud file could not be retrieved."
      });
      continue;
    }

    const bytes = await response.arrayBuffer();

    if (bytes.byteLength > MAX_FILE_BYTES) {
      results.push({
        name: clean(ref.name, 240),
        status: "too_large",
        message: "File exceeds the current 50 MB ingestion limit."
      });
      continue;
    }

    try {
      const ast = await officeParser.parseOffice(new Uint8Array(bytes));
      const extracted = String(await ast.toText() || "").trim();

      const limited = extracted.slice(0, 45000);

      results.push({
        name: clean(ref.name, 240),
        type: clean(ref.type, 160),
        size: bytes.byteLength,
        status: "read",
        characters: limited.length
      });

      if (limited) {
        textParts.push(`\n===== FILE: ${clean(ref.name, 240)} =====\n${limited}`);
      }
    } catch (error) {
      results.push({
        name: clean(ref.name, 240),
        status: "unsupported",
        message: error?.message || "Document parser could not read this file."
      });
    }
  }

  return {
    files: results,
    text: textParts.join("\n")
  };
}

module.exports = { readCloudFiles };
