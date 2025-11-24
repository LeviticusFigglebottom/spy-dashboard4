export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Try Polygon first
    const polygonRes = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?adjusted=true&apiKey=hbSH0tqz8wB_GqVicAoBrf_pfqDggwB3`
    );
    const polygonData = await polygonRes.json();
    
    if (polygonData?.results?.[0]?.c) {
      return res.status(200).json({
        price: polygonData.results[0].c,
        source: 'polygon',
        timestamp: new Date().toISOString()
      });
    }
    
    // Fallback to Yahoo Finance
    const yahooRes = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/^VIX?interval=1d&range=1d'
    );
    const yahooData = await yahooRes.json();
    
    if (yahooData?.chart?.result?.[0]?.meta) {
      const price = yahooData.chart.result[0].meta.regularMarketPrice || 
                   yahooData.chart.result[0].meta.previousClose;
      return res.status(200).json({
        price: price,
        source: 'yahoo',
        timestamp: new Date().toISOString()
      });
    }
    
    throw new Error('All VIX sources failed');
  } catch (error) {
    console.error('VIX API Error:', error);
    return res.status(500).json({ 
      error: error.message,
      fallback: 14.23
    });
  }
}
