import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

var fs = require('fs');
var U = require('../legacy/servicing/util.js');
var A = require('../legacy/servicing/arrears.js');
var F = require('../legacy/servicing/fees.js');
var S = require('../legacy/servicing/settlement.js');

var IN = process.env.INST_FILE || 'legacy/data/installments.json';
var OUT = process.env.INST_OUT || 'legacy/data/installments.out.json';

var src = fs.existsSync(OUT) ? OUT : IN;
var data;
try {
  data = JSON.parse(fs.readFileSync(src, 'utf8'));
} catch (e) {
  console.error('nightly: cannot read ' + src + ': ' + e.message);
  process.exit(1);
}

var bd = U.pd(process.argv[2] || data.bizDate || new Date());
if (bd === -1) {
  console.error('nightly: bad business date');
  process.exit(2);
}

console.log('nightly fees ' + U.fmt(bd) + ' (' + src + ') started ' + new Date().toISOString());

var cnt = 0;
var sum = 0;
var skipped = 0;

for (var i = 0; i < data.items.length; i++) {
  var it = data.items[i];
  if (it.paid) {
    skipped++;
    continue;
  }

  if (U.money(it.rcv) > 0) {
    var over = S.alloc(it, it.rcv);
    console.log('  ' + it.id + ' received ' + U.money(it.rcv).toFixed(2) + ' -> fees ' + U.money(it.fees).toFixed(2) + ' int ' + U.money(it.int).toFixed(2) + ' prin ' + U.money(it.prin).toFixed(2));
    it.rcv = 0;
    if (over > 0) console.log('  ' + it.id + ' overpayment ' + over.toFixed(2));
    if (S.isClear(it)) {
      it.paid = true;
      console.log('  ' + it.id + ' cleared');
      continue;
    }
  }

  var due = U.pd(it.due_date);
  if (due === -1) {
    console.warn('  ' + it.id + ' bad due date ' + it.due_date);
    continue;
  }
  var dd = U.dd(due, bd);
  if (dd <= 0) continue;

  var tmp = 0;
  var late = dd > 10 && !it.lfc;
  var lf = late ? A.adj(it, 25) : 0;

  if (it.ret && !it.rfc) {
    tmp += parseFloat(F.fee('ret'));
    it.rfc = true;
    if (late) {
      tmp += lf;
      it.lfc = true;
    }
  } else if (late) {
    tmp += lf;
  }

  if (late && lf == 0) {
    console.log('  ' + it.id + ' ' + it.loan + ' #' + it.no + ' dpd=' + dd + ' fee 0.00 (adj)');
  }

  if (tmp > 0) {
    it.fees = U.r2(U.money(it.fees) + tmp);
    cnt++;
    sum += tmp;
    console.log('  ' + it.id + ' ' + it.loan + ' #' + it.no + ' dpd=' + dd + ' ' + A.label(A.getStage(dd)) + ' fee ' + tmp.toFixed(2) + ' (total fees ' + it.fees.toFixed(2) + ')');
  }
}

data.lastRun = U.fmt(bd);
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

console.log('nightly fees done: ' + cnt + ' fees applied, ' + sum.toFixed(2) + ' USD, ' + skipped + ' paid skipped');
console.log('written ' + OUT);
