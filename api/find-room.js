module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { query, currentTime } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'No API key' });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Extract JSON from this room request: "${query}". Current time: ${currentTime}. Return ONLY JSON with keys: { "floor" (string/null), "ac" (boolean/null), "minCapacity" (number/null), "durationMinutes" (number, default 60), "startTime" (string HH:MM, default now), "date" (YYYY-MM-DD, default today), "roomType" (string/null) }. No markdown, only raw JSON.` }] }]
      })
    });
    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text.trim();
    if(text.startsWith("```json")) text = text.substring(7, text.length-3).trim();
    if(text.startsWith("```")) text = text.substring(3, text.length-3).trim();
    res.status(200).json(JSON.parse(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
