// src/utils/marketData.js
// Market data fetching utilities - keeps main dashboard clean

/**
 * Fetch current market prices via proxies
 */
export const fetchCurrentPrices = async () => {
  let spySuccess = false;
  let vixSuccess = false;
  let skewSuccess = false;
  let spyPrice = null;
  let vixPrice = null;
  let skewValue = null;

  try {
    console.log('🔄 Fetching current market data...');

    // SPY
    try {
      const res = await fetch('/api/spy');
      const data = await res.json();
      if (data?.price) {
        spyPrice = data.price;
        spySuccess = true;
        console.log('✅ SPY:', data.price, 'from', data.source);
      }
    } catch (err) {
      console.log('⚠️ SPY failed:', err);
    }

    // VIX
    try {
      const res = await fetch('/api/vix');
      const data = await res.json();
      if (data?.price) {
        vixPrice = data.price;
        vixSuccess = true;
        console.log('✅ VIX:', data.price, 'from', data.source);
      }
    } catch (err) {
      console.log('⚠️ VIX failed:', err);
    }

    // SKEW
    try {
      const res = await fetch('/api/skew');
      const data = await res.json();
      if (data?.value) {
        skewValue = data.value;
        skewSuccess = true;
        console.log('✅ SKEW:', data.value, 'from', data.source);
      }
    } catch (err) {
      console.log('⚠️ SKEW failed:', err);
    }

    // Fallbacks
    if (!spySuccess) spyPrice = 595.42;
    if (!vixSuccess) vixPrice = 14.23;
    if (!skewSuccess) skewValue = 135.7;

    return {
      spy: spyPrice,
      vix: vixPrice,
      skew: skewValue,
      status: { spy: spySuccess, vix: vixSuccess, skew: skewSuccess }
    };
  } catch (error) {
    console.error('❌ Market data error:', error);
    return {
      spy: 595.42,
      vix: 14.23,
      skew: 135.7,
      status: { spy: false, vix: false, skew: false }
    };
  }
};

/**
 * Fetch historical price data (30 days)
 */
export const fetchHistoricalData = async (currentSpy, currentVix) => {
  try {
    console.log('📈 Fetching historical data...');

    const [spyRes, vixRes] = await Promise.all([
      fetch('/api/historical?ticker=SPY'),
      fetch('/api/historical?ticker=^VIX')
    ]);

    const [spyData, vixData] = await Promise.all([
      spyRes.json(),
      vixRes.json()
    ]);

    if (spyData?.data && vixData?.data && spyData.data.length > 0) {
      console.log('✅ Historical data:', spyData.data.length, 'days');

      const data = [];
      const startPrice = spyData.data[0].close;

      for (let i = 0; i < Math.min(spyData.data.length, vixData.data.length); i++) {
        const spyPoint = spyData.data[i];
        const vixPoint = vixData.data[i];

        const date = new Date(spyPoint.timestamp * 1000);
        const spy = spyPoint.close;
        const vix = vixPoint.close;
        const spyPctChange = ((spy - startPrice) / startPrice) * 100;

        // Simulated metrics (need real options data)
        const pcr = 0.7 + Math.random() * 0.7 + (vix > 20 ? 0.3 : 0);
        const gammaFlip = spy * (0.985 + Math.random() * 0.03);

        data.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: date,
          spy: parseFloat(spy.toFixed(2)),
          spyPctChange: parseFloat(spyPctChange.toFixed(2)),
          vix: parseFloat(vix.toFixed(2)),
          pcr: parseFloat(pcr.toFixed(3)),
          gammaFlip: parseFloat(gammaFlip.toFixed(2)),
          skew: 120 + (vix - 12) * 2 + Math.random() * 10,
          gammaShort: spy > gammaFlip ? -1 : 1
        });
      }

      return data;
    }
  } catch (error) {
    console.error('❌ Historical data failed:', error);
  }

  // Fallback to simulated
  console.log('⚠️ Using simulated historical data');
  return generateSimulatedHistory(currentSpy, currentVix);
};

/**
 * Fetch options chain (Tradier if available, otherwise simulated)
 */
export const fetchOptionsChain = async (spy, vix) => {
  try {
    console.log('🔄 Fetching options chain...');

    // Try Tradier
    const expRes = await fetch('/api/tradier?symbol=SPY');
    const expData = await expRes.json();

    if (expData?.expirations && expData.expirations.length > 0) {
      const allOptions = [];

      for (const expiration of expData.expirations.slice(0, 4)) {
        const chainRes = await fetch(`/api/tradier?symbol=SPY&expiration=${expiration}`);
        const chainData = await chainRes.json();

        if (chainData?.options) {
          const expDate = new Date(expiration);
          const today = new Date();
          const daysToExp = Math.max(1, Math.ceil((expDate - today) / 86400000));

          const optionsWithDTE = chainData.options.map(opt => ({
            ...opt,
            daysToExp
          }));

          allOptions.push(...optionsWithDTE);
        }
      }

      if (allOptions.length > 0) {
        console.log('✅ Real options:', allOptions.length, 'contracts');
        return allOptions;
      }
    }
  } catch (error) {
    console.log('⚠️ Tradier unavailable:', error.message);
  }

  // Fallback
  console.log('📊 Using simulated options');
  return generateSimulatedOptions(spy, vix);
};

/**
 * Generate simulated historical data (fallback)
 */
function generateSimulatedHistory(currentSpy, currentVix) {
  const data = [];
  const days = 30;
  const startPrice = currentSpy - 15;

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const progress = 1 - (i / days);
    const trend = startPrice + (15 * progress);
    const noise = Math.sin(i / 3) * 3 + (Math.random() - 0.5) * 2;
    const spy = trend + noise;

    const spyChange = i < days ? (spy - (trend - 15 / days)) : 0;
    const vixBase = currentVix - spyChange * 0.2;
    const vix = Math.max(10, Math.min(30, vixBase + Math.random() * 1.5));

    const spyPctChange = ((spy - startPrice) / startPrice) * 100;
    const pcr = 0.7 + Math.random() * 0.7 + (vix > 20 ? 0.3 : 0);
    const gammaFlip = spy * (0.985 + Math.random() * 0.03);

    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: date,
      spy: parseFloat(spy.toFixed(2)),
      spyPctChange: parseFloat(spyPctChange.toFixed(2)),
      vix: parseFloat(vix.toFixed(2)),
      pcr: parseFloat(pcr.toFixed(3)),
      gammaFlip: parseFloat(gammaFlip.toFixed(2)),
      skew: 120 + (vix - 12) * 2 + Math.random() * 10,
      gammaShort: spy > gammaFlip ? -1 : 1
    });
  }
  return data;
}

/**
 * Generate simulated options chain (fallback)
 */
function generateSimulatedOptions(spy, vix) {
  // Import calculateGreeks or pass it in
  // For now, return basic structure
  return [];
}
