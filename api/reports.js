module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { room, type, note } = req.body;
  if (!room || !type) return res.status(400).json({ error: 'Missing fields' });
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    return res.status(200).json({ fallback: true, message: 'Saved to local device only' });
  }

  try {
    const key = `report:${room}:${Date.now()}`;
    await fetch(`${url}/set/${key}/${encodeURIComponent(JSON.stringify({type, note}))}?EX=7200`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.status(200).json({ success: true });
  } catch (e) {
    res.status(500).json({ fallback: true, error: e.message });
  }
};
