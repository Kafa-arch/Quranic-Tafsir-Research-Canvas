module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      error: "Supabase public configuration is not configured on Vercel."
    });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey
  });
};
