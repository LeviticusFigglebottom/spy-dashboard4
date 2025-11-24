export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { ticker } = req.query;
  
  if (!ticker) {
    return res.status(400).json({ error: 'Ticker required' });
  }
  
  try {
    // Get last 30 days of data
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (30 * 24 * 60 * 60);
    
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${startDate}&period2=${endDate}`
    );
    const data = await response.json();
    
    if (data?.chart?.result?.[0]) {
      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const closes = result.indicators.quote[0].close;
      
      // Filter out null values and combine
      const historicalData = timestamps
        .map((ts, i) => ({
          timestamp: ts,
          close: closes[i]
        }))
        .filter(d => d.close !== null);
      
      return res.status(200).json({
        ticker,
        data: historicalData,
        source: 'yahoo',
        timestamp: new Date().toISOString()
      });
    }
    
    throw new Error('No data returned from Yahoo');
  } catch (error) {
    console.error('Historical data error:', error);
    return res.status(500).json({ 
      error: error.message,
      ticker
    });
  }
}
