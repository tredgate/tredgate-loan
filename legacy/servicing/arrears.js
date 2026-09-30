'use strict';

var U = require('./util');

var LBL = ['CURRENT', 'STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4'];

var ACT = {
  0: 'none',
  1: 'reminder',
  2: 'call_letter',
  3: 'demand_restrict',
  4: 'default_referral'
};

function start(l) {
  var s = U.pd(l.disbursedAt || l.createdAt);
  if (s === -1) {
    console.warn('arrears: no start date for loan', l && l.id);
    return -1;
  }
  return s;
}

function dueDate(l, k) {
  var s = start(l);
  if (s === -1) return -1;
  return U.addM(s, k);
}

// stage from days past due: 1-30, 31-45, 46-90, 91+ (collections memo 2019)
function getStage(d) {
  if (d <= 0) return 0;
  if (d <= 30) return 1;
  if (d <= 60) return 2;
  if (d <= 90) return 3;
  return 4;
}

function label(s) {
  return LBL[s] || 'UNKNOWN';
}

function action(s) {
  return ACT[s] || 'none';
}

function chk(l, dt, n) {
  var asOf = dt === undefined ? U.today() : U.pd(dt);
  if (asOf === -1) return -1;
  var k = (n || 0) + 1;
  if (k > l.termMonths) {
    l.dpd = 0;
    l.stg = 0;
    l.od = [];
    return 0;
  }
  var first = dueDate(l, k);
  if (first === -1) return -1;
  var d = U.dd(first, asOf);
  if (d < 0) d = 0;

  var od = [];
  while (k <= l.termMonths) {
    var due = dueDate(l, k);
    var x = U.dd(due, asOf);
    if (x <= 0) break;
    od.push({ no: k, due: U.fmt(due), dpd: x });
    k++;
  }

  l.dpd = d;
  l.stg = getStage(d);
  l.od = od;
  U.C.last = { id: l.id, dpd: d, stg: l.stg, at: Date.now() };
  U.log('chk', l.id, 'dpd', d, 'stage', l.stg, 'overdue', od.length);
  return l.stg;
}

function adj(x, f) {
  if (x && x.hs && x.hs.a) {
    U.log('adj', x.id, f, '->', 0);
    return typeof f == 'string' ? '0.00' : 0;
  }
  return f;
}

function hsOk(l) {
  var s = l.stg;
  if (s === undefined && U.C.last && U.C.last.id == l.id) s = U.C.last.stg;
  return s >= 1 && s <= 3;
}

function summary(l) {
  var s = l.stg !== undefined ? l.stg : 0;
  return {
    stage: label(s),
    action: action(s),
    dpd: l.dpd || 0,
    overdue: l.od ? l.od.length : 0,
    hardshipAllowed: hsOk(l)
  };
}

module.exports = {
  dueDate: dueDate,
  getStage: getStage,
  label: label,
  chk: chk,
  adj: adj,
  hsOk: hsOk,
  summary: summary
};
