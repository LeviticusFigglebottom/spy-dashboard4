// NOTE: Get your free Tradier sandbox API key from https://tradier.com/
// Add it to Vercel environment variables as TRADIER_API_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { symbol, expiration } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  // Get API key from environment variable
  const apiKey = process.env.TRADIER_API_KEY || 'DEMO_KEY';
  
  try {
    // If no expiration provided, get the next 4 weekly expirations
    if (!expiration) {
      const expRes = await fetch(
        `https://sandbox.tradier.com/v1/markets/options/expirations?symbol=${symbol}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          }
        }
      );
      const expData = await expRes.json();
      
      if (expData?.expirations?.date) {
        const expirations = expData.expirations.date.slice(0, 4); // Next 4 expirations
        return res.status(200).json({
          symbol,
          expirations,
          source: 'tradier'
        });
      }
    }
    
    // Get options chain for specific expiration
    const chainRes = await fetch(
      `https://sandbox.tradier.com/v1/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      }
    );
    const chainData = await chainRes.json();
    
    if (chainData?.options?.option) {
      // Transform Tradier format to our format
      const options = chainData.options.option.map(opt => ({
        expiration: opt.expiration_date,
        strike: opt.strike,
        type: opt.option_type.toUpperCase(), // 'call' -> 'CALL'
        iv: opt.greeks?.mid_iv || 0,
        oi: opt.open_interest || 0,
        volume: opt.volume || 0,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        delta: opt.greeks?.delta || 0,
        gamma: opt.greeks?.gamma || 0,
        vega: opt.greeks?.vega || 0,
        theta: opt.greeks?.theta || 0,
        lastPrice: opt.last || 0,
        bidSize: opt.bidsize || 0,
        askSize: opt.asksize || 0
      }));
      
      return res.status(200).json({
        symbol,
        expiration,
        options,
        source: 'tradier',
        timestamp: new Date().toISOString()
      });
    }
    
    throw new Error('No options data returned');
  } catch (error) {
    console.error('Tradier API Error:', error);
    return res.status(500).json({ 
      error: error.message,
      note: 'Set TRADIER_API_KEY in Vercel environment variables'
    });
  }
}
