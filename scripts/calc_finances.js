// Exact financial calculations for ObraTrack
const r = 0.11831; // Ke
const cf = [-38466518, -11060979, 1807442, 17658500, 74687289];

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
      if (t > 0) {
        deriv -= t * cashflows[t] / Math.pow(1 + rate, t + 1);
      }
    }
    const newRate = rate - val / deriv;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    rate = newRate;
  }
  return rate;
}

const calculatedNPV = npv(r, cf);
const calculatedIRR = irr(cf);

console.log("Cash flows:", cf);
console.log("Calculated NPV:", Math.round(calculatedNPV));
console.log("Calculated IRR:", (calculatedIRR * 100).toFixed(2) + "%");

// Calculate Payback (PRI)
let cum = cf[0];
console.log("Year 0 cum:", cum);
for (let t = 1; t < cf.length; t++) {
  cum += cf[t];
  console.log(`Year ${t} cum:`, cum);
}
