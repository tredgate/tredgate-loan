'use strict';

var U = require('./util');
var S = require('../../shared/servicing.ts');

var handlers = {
  calc_orig: function (l) {
    return S.calcOrigFee(l);
  },

  calc_late: function (x) {
    var d;
    if (x && typeof x.dpd == 'number') d = x.dpd;
    else if (U.C.last) d = U.C.last.dpd;
    else d = 0;
    return S.calcLateFee(d);
  },

  calc_ret: function () {
    return S.calcRetFee();
  },

  calc_settle: function (rp, pct) {
    var p = pct === undefined ? 0.01 : pct;
    return S.calcSettleFee(U.money(rp), p);
  }
};

function fee(type, a, b) {
  var h = handlers['calc_' + type];
  if (typeof h != 'function') {
    console.warn('fees: unknown fee type ' + type);
    return -1;
  }
  var r = h(a, b);
  U.log('fee', type, r);
  return r;
}

function sumLate(l) {
  var t = 0;
  var od = l && l.od ? l.od : [];
  for (var i = 0; i < od.length; i++) {
    var f = fee('late', od[i]);
    if (f === -1) continue;
    t += parseFloat(f);
  }
  return t.toFixed(2);
}

function netProceeds(l) {
  var f = fee('orig', l);
  if (f === -1) return -1;
  return U.r2(l.amount - parseFloat(f));
}

/*
function toUsd(x, ccy) {
  if (ccy == 'EUR') return x * 1.08;
  if (ccy == 'CZK') return x / 23.1;
  if (ccy == 'ZAR') return x / 18.4;
  return x;
}
*/

module.exports = {
  fee: fee,
  sumLate: sumLate,
  netProceeds: netProceeds
};
