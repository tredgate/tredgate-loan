'use strict';

var U = require('./util');
var F = require('./fees');
var A = require('./arrears');

function split(l) {
  var p = l.amount / l.termMonths;
  var i = (l.amount * l.interestRate) / l.termMonths;
  return { prin: U.r2(p), int: U.r2(i), inst: U.r2(p + i) };
}

function sched(l) {
  var s = split(l);
  var out = [];
  for (var k = 1; k <= l.termMonths; k++) {
    var d = A.dueDate(l, k);
    if (d === -1) return -1;
    out.push({ no: k, due: U.fmt(d), prin: s.prin, int: s.int, amt: s.inst });
  }
  return out;
}

function quote(l, paid, dt) {
  if (U.chkLoan(l) != 'OK') return -1;
  var x2 = parseInt(paid, 10);
  if (isNaN(x2) || x2 < 0) return { st: 'ERR_1' };
  if (x2 >= l.termMonths) return { st: 'ERR_2' };
  var asOf = dt === undefined || dt === '' ? U.today() : U.pd(dt);
  if (asOf === -1) return { st: 'ERR_3' };

  if (A.chk(l, asOf, x2) === -1) return { st: 'ERR_3' };

  var tmp = (l.amount * (l.termMonths - x2)) / l.termMonths;
  var pct = parseFloat(U.cfg('SETTLE_FEE_PCT', '0.01'));
  var w = x2 * 2 > l.termMonths;
  var fee = w ? '0.00' : F.fee('settle', tmp, pct);
  var tot = w ? U.r2(tmp) : Math.round((tmp + tmp * pct) * 100) / 100;

  // if (tot > 50000) {
  //   notify('collections@tredgate.example', 'large settlement ' + l.id + ' ' + tot);
  // }

  var res = {
    st: 'OK',
    id: l.id,
    asOf: U.fmt(asOf),
    paid: x2,
    left: l.termMonths - x2,
    rp: U.r2(tmp),
    fee: fee,
    waived: w,
    total: tot,
    dpd: l.dpd,
    stage: A.label(l.stg),
    lateFees: A.adj(l, F.sumLate(l))
  };
  console.log('settlement quote', l.id, 'paid', x2, 'total', tot);
  return res;
}

function alloc(it, amt) {
  var x = U.money(amt);
  if (x <= 0) return 0;

  var f = U.money(it.fees);
  if (x >= f) {
    x = x - f;
    it.fees = 0;
  } else {
    it.fees = U.r2(f - x);
    return 0;
  }

  var i2 = U.money(it.int);
  if (x >= i2) {
    x = x - i2;
    it.int = 0;
  } else {
    it.int = U.r2(i2 - x);
    return 0;
  }

  var p = U.money(it.prin);
  if (x >= p) {
    x = x - p;
    it.prin = 0;
  } else {
    it.prin = U.r2(p - x);
    return 0;
  }

  U.log('alloc', it.id, 'overpaid', x);
  return U.r2(x);
}

function isClear(it) {
  return U.money(it.fees) == 0 && U.money(it.int) == 0 && U.money(it.prin) == 0;
}

module.exports = {
  split: split,
  sched: sched,
  quote: quote,
  alloc: alloc,
  isClear: isClear
};
