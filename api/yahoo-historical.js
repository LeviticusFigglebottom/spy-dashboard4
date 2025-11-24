// Yahoo Finance Historical Data Proxy
// This avoids CORS issues when fetching from Yahoo Finance directly

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { symbol, period1, period2, interval = '1d' } = req.query;

  if (!symbol || !period1 || !period2) {
    return res.status(400).json({ 
      error: 'Missing required parameters: symbol, period1, period2' 
    });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Yahoo Finance returned ${response.status}` 
      });
    }

    const data = await response.json();
    
    // Return the data as-is
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Yahoo Finance proxy error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from Yahoo Finance',
      details: error.message 
    });
  }
}
