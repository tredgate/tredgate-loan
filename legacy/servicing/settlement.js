'use strict';

var U = require('./util');
var F = require('./fees');
var A = require('./arrears');
var S = require('../../shared/servicing.ts');

function split(l) {
  return S.splitInstallment(l.amount, l.termMonths, l.interestRate);
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

  // if (tot > 50000) {
  //   notify('collections@tredgate.example', 'large settlement ' + l.id + ' ' + tot);
  // }

  var pct = parseFloat(U.cfg('SETTLE_FEE_PCT', '0.01'));
  var lateFees = A.adj(l, F.sumLate(l));
  var res = S.calcSettlementResult(
    l.id, l.amount, l.termMonths, x2, asOf,
    l.dpd, A.label(l.stg), lateFees, pct
  );
  console.log('settlement quote', l.id, 'paid', x2, 'total', res.total);
  return res;
}

function alloc(it, amt) {
  var res = S.allocPayment(it.fees, it.int, it.prin, amt);
  it.fees = res.fees;
  it.int = res.int;
  it.prin = res.prin;
  if (res.overpayment > 0) U.log('alloc', it.id, 'overpaid', res.overpayment);
  return res.overpayment;
}

function isClear(it) {
  return S.isItemClear(it.fees, it.int, it.prin);
}

module.exports = {
  split: split,
  sched: sched,
  quote: quote,
  alloc: alloc,
  isClear: isClear
};
