const { norm } = require('./security');

function reverseString(str) {
  return str.split('').reverse().join('');
}

function computeFinalKey(f1, f2, f3, f4, f5) {
  // f1 = NOVA, f2 = 7K2, f3 = ORBIT, f4 = 91X, f5 = HEX82D
  // Alphabetical order by Mission Name:
  // 1. Cyber Defense (f4)
  // 2. Decoding (f2)
  // 3. Hex Decryption (f5 without dashes)
  // 4. Prompt the AI (reverse f3)
  // 5. Signal Intercept (f1)
  const f5Clean = String(f5 || 'HEX82D').replace(/-/g, '');
  const body = [
    f4 || '91X',
    f2 || '7K2',
    f5Clean,
    reverseString(f3 || 'ORBIT'),
    f1 || 'NOVA'
  ].join('-');

  let digitSum = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char >= '0' && char <= '9') {
      digitSum += parseInt(char, 10);
    }
  }

  const key = `FO{${body}}#${digitSum}`;
  return norm(key);
}

module.exports = {
  computeFinalKey,
  reverseString
};
