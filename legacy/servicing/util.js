'use strict';

var C = {};

var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function log() {
  if (!process.env.SVC_DEBUG) return;
  var a = Array.prototype.slice.call(arguments);
  a.unshift('[svc ' + new Date().toISOString() + ']');
  console.log.apply(console, a);
}

function r2(x) {
  return Math.round(x * 100) / 100;
}

function money(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v == 'string') {
    var n = parseFloat(v.replace(/[, ]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return v;
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function pd(s) {
  if (s instanceof Date) {
    if (isNaN(s.getTime())) return -1;
    return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  }
  if (typeof s != 'string' || s.length < 10) return -1;
  var p = s.substring(0, 10).split('-');
  if (p.length != 3) return -1;
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  var d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return -1;
  if (m < 1 || m > 12 || d < 1 || d > 31) return -1;
  var r = new Date(y, m - 1, d);
  if (r.getMonth() != m - 1) return -1;
  return r;
}

function fmt(d) {
  if (!(d instanceof Date)) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fmtLong(d) {
  if (!(d instanceof Date)) return '';
  return pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
}

function today() {
  var n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function dd(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return -1;
  return r2((b.getTime() - a.getTime()) / 86400000);
}

function addM(dt, k) {
  var y = dt.getFullYear();
  var m = dt.getMonth() + k;
  var d = dt.getDate();
  var last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, d > last ? last : d);
}

function cfg(k, def) {
  if (C['cfg_' + k] === undefined) {
    var v = process.env[k];
    C['cfg_' + k] = v === undefined || v === '' ? def : v;
    log('cfg', k, C['cfg_' + k]);
  }
  return C['cfg_' + k];
}

function chkLoan(l) {
  if (!l || typeof l != 'object') return 'ERR_0';
  if (!(l.amount > 0)) return 'ERR_0';
  if (!(l.termMonths > 0)) return 'ERR_0';
  if (typeof l.interestRate != 'number') return 'ERR_0';
  return 'OK';
}

exports.C = C;
exports.log = log;
exports.r2 = r2;
exports.money = money;
exports.pd = pd;
exports.fmt = fmt;
exports.fmtLong = fmtLong;
exports.today = today;
exports.dd = dd;
exports.addM = addM;
exports.cfg = cfg;
exports.chkLoan = chkLoan;
