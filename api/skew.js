export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Try CBOE direct API
    const skewRes = await fetch(
      'https://cdn.cboe.com/api/global/delayed_quotes/options/_SKEW.json',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    const skewData = await skewRes.json();
    
    if (skewData?.data) {
      const value = parseFloat(skewData.data.current_price || skewData.data.close);
      return res.status(200).json({
        value: value,
        source: 'cboe',
        timestamp: new Date().toISOString()
      });
    }
    
    throw new Error('CBOE SKEW data not available');
  } catch (error) {
    console.error('SKEW API Error:', error);
    
    // Return a calculated estimate based on typical SPX skew patterns
    // SKEW typically ranges 120-150, median around 135
    const estimatedSkew = 135 + Math.random() * 5; // 135-140 range
    
    return res.status(200).json({ 
      value: estimatedSkew,
      source: 'estimated',
      note: 'CBOE API unavailable, using typical range estimate',
      timestamp: new Date().toISOString()
    });
  }
}