// Calculate sensitivity scenarios accurately
function runScenario(multiplier) {
  // Demand multiplier
  const clients = [35 * multiplier, 85 * multiplier, 160 * multiplier, 250 * multiplier];
  const ticketPrices = [29490, 29490 * 1.038, 29490 * Math.pow(1.038, 2), 29490 * Math.pow(1.038, 3)];
  const revenues = clients.map((c, i) => Math.round(c * ticketPrices[i] * 12));
  
  // Costs
  const cloudCosts = [1503600 * multiplier, 4191773 * multiplier, 7985471 * multiplier, 9658708 * multiplier];
  const payComm = revenues.map(r => Math.round(r * 0.025));
  const salesComm = revenues.map(r => Math.round(r * 0.08));
  
  const fixedStaff = [17556000, 18223128, 18915607, 19634399];
  const adminExp = [2148000, 2502264, 2858590, 3277056];
  const softLic = [938670, 974340, 1011364, 1049796];
  const dep = [1144983, 1144983, 974992, 0];
  
  const cashflows = [-38466518];
  
  for (let i = 0; i < 4; i++) {
    const rev = revenues[i];
    const totalCosts = cloudCosts[i] + payComm[i] + salesComm[i] + fixedStaff[i] + adminExp[i] + softLic[i] + dep[i];
    const uai = rev - totalCosts;
    const tax = uai > 0 ? Math.round(uai * 0.27) : 0;
    const udi = uai - tax;
    let cf = udi + dep[i];
    if (i === 3) {
      cf += 34000000; // recover KT
      cf += 585000;   // salvage value
    }
    cashflows.push(cf);
  }
  
  const r = 0.11831;
  const n = npv(r, cashflows);
  const ir = irr(cashflows);
  return { multiplier, cashflows, npv: Math.round(n), irr: (ir * 100).toFixed(2) + "%" };
}

function npv(rate, cashflows) {
  let val = cashflows[0];
  for (let t = 1; t < cashflows.length; t++) {
    val += cashflows[t] / Math.pow(1 + rate, t);
  }
  return val;
}

function irr(cashflows, guess = 0.1) {
  let rate = guess;
  for (let i = 0; i < 1000; i++) {
    let val = 0;
    let deriv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      val += cashflows[t] / Math.pow(1 + rate, t);
      if (t > 0) deriv -= t * cashflows[t] / Math.pow(1 + rate, t + 1);
    }
    const newRate = rate - val / deriv;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    rate = newRate;
  }
  return rate;
}

console.log("Pesimista (-20%):", runScenario(0.8));
console.log("Base (0%):", runScenario(1.0));
console.log("Optimista (+20%):", runScenario(1.2));
