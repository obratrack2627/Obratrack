// Test with 40, 90, 170, 260 clients
const IPC = 0.038;
const Ke = 0.11831;
const taxRate = 0.27;

const clients = [40, 90, 170, 260];
const ticketP = [39990, 39990 * (1 + IPC), 39990 * Math.pow(1 + IPC, 2), 39990 * Math.pow(1 + IPC, 3)];
const rev = clients.map((c, i) => Math.round(c * ticketP[i] * 12));

const cloud = [1503600, 4191773, 7985471, 9658708];
const payComm = rev.map(r => Math.round(r * 0.025));
const salesComm = rev.map(r => Math.round(r * 0.08));

const staff = [25080000, 37620000, 46398000, 54549000];
const admin = [2148000, 2502264, 2858590, 3277056];
const soft = [938670, 974340, 1011364, 1049796];
const dep = [1002500, 1002500, 855000, 225000];

const inv0 = 2280000 + 1085510 + 17000000; // 20.365.510
const inv1_machinery = 900000;
const salvageValue = 450000;
const kt_recovery = 17000000;

const cf = [-inv0];

for (let i = 0; i < 4; i++) {
  const r = rev[i];
  const varCosts = cloud[i] + payComm[i] + salesComm[i];
  const fixCosts = staff[i] + admin[i] + soft[i];
  const d = dep[i];
  const uai = r - (varCosts + fixCosts + d);
  const tax = uai > 0 ? Math.round(uai * taxRate) : 0;
  const udi = uai - tax;
  let cash = udi + d;
  if (i === 0) cash -= inv1_machinery;
  if (i === 3) {
    cash += kt_recovery;
    cash += salvageValue;
  }
  cf.push(cash);
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

console.log("Revenues:", rev);
console.log("Cash flows:", cf);
console.log("NPV (Ke 11.83%):", Math.round(npv(Ke, cf)));
console.log("IRR:", (irr(cf) * 100).toFixed(2) + "%");
