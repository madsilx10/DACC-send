const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
require("dotenv").config();

// ─── CONFIG ───────────────────────────────────────────────
const RPC_URL = "https://rpctest.dachain.tech";
const CHAIN_ID = 21894;
const SYMBOL = "DACC";
const MAX_VALUE = parseFloat(process.env.MAX_VALUE || "0.1");
const MIN_RECIPIENTS = parseInt(process.env.MIN_RECIPIENTS || "3");
const MAX_RECIPIENTS = parseInt(process.env.MAX_RECIPIENTS || "10");
// ──────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, retries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      const isRetryable =
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.message?.includes("socket hang up");
      if (isRetryable && attempt < retries) {
        console.log(`\n⚠️  RPC koneksi gagal (${err.code}), retry ${attempt}/${retries - 1}...`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
}

const provider = new ethers.JsonRpcProvider(
  RPC_URL,
  { chainId: CHAIN_ID, name: "dacchain-testnet" },
  { timeout: 60000, fetchFunc: fetchWithRetry }
);

function loadWallets() {
  const wallets = [];

  if (process.env.WALLET_FIRST) {
    try {
      const wallet = new ethers.Wallet(process.env.WALLET_FIRST, provider);
      wallets.push({ index: "FIRST", wallet });
    } catch (e) {
      console.error(`❌ WALLET_FIRST invalid, dilewat.`);
    }
  }

  let i = 1;
  while (process.env[`WALLET_${i}`]) {
    try {
      const wallet = new ethers.Wallet(process.env[`WALLET_${i}`], provider);
      wallets.push({ index: i, wallet });
    } catch (e) {
      console.error(`❌ WALLET_${i} invalid, dilewat.`);
    }
    i++;
  }
  return wallets;
}

function loadRecipients() {
  const filePath = path.join(__dirname, "recipients.txt");
  if (!fs.existsSync(filePath)) {
    console.error("❌ File recipients.txt tidak ditemukan!");
    process.exit(1);
  }
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && ethers.isAddress(l));
}

function randomValue(min = 0.00001, max = MAX_VALUE) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(6));
}

function pickRandomRecipients(recipients) {
  const myAddresses = [];

  if (process.env.MY_ADDRESS_FIRST) {
    myAddresses.push(process.env.MY_ADDRESS_FIRST.toLowerCase());
  }

  let i = 1;
  while (process.env[`MY_ADDRESS_${i}`]) {
    myAddresses.push(process.env[`MY_ADDRESS_${i}`].toLowerCase());
    i++;
  }

  const filtered = myAddresses.length
    ? recipients.filter((r) => !myAddresses.includes(r.toLowerCase()))
    : recipients;
  const count = Math.floor(Math.random() * (MAX_RECIPIENTS - MIN_RECIPIENTS + 1)) + MIN_RECIPIENTS;
  const actual = Math.min(count, filtered.length);
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, actual);
}

async function askMode(wallets) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n📂 Wallet tersedia:");
  for (const { index, wallet } of wallets) {
    const balance = await provider.getBalance(wallet.address);
    const bal = ethers.formatEther(balance);
    console.log(`  [${index}] ${wallet.address} — ${parseFloat(bal).toFixed(4)} ${SYMBOL}`);
  }

  console.log("\nMode jalanin:");
  console.log("  [A] Semua wallet (mulai dari FIRST)");
  console.log("  [S] Pilih satu wallet");

  return new Promise((resolve) => {
    rl.question("\nPilih mode (A/S): ", (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase());
    });
  });
}

async function selectWallet(wallets) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question("Pilih nomor wallet (contoh: FIRST atau 1): ", (answer) => {
      rl.close();
      const selected = wallets.find((w) => String(w.index) === answer.trim());
      if (!selected) {
        console.error("❌ Pilihan tidak valid.");
        process.exit(1);
      }
      resolve(selected.wallet);
    });
  });
}

async function sendToken(wallet, to, valueEther, retries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const tx = await wallet.sendTransaction({
        to,
        value: ethers.parseEther(valueEther.toString()),
        gasLimit: 21000,
      });
      return tx;
    } catch (err) {
      const isRetryable =
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.message?.includes("socket hang up");
      if (isRetryable && attempt < retries) {
        console.log(`\n⚠️  TX gagal (${err.code}), retry ${attempt}/${retries - 1}...`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
}

async function delayWithBar() {
  const delay = Math.floor(Math.random() * (120000 - 60000 + 1)) + 60000;
  const seconds = Math.round(delay / 1000);
  const barLength = 20;
  let elapsed = 0;

  process.stdout.write("\n");
  const barInterval = setInterval(() => {
    elapsed++;
    const progress = Math.min(elapsed / seconds, 1);
    const filled = Math.round(progress * barLength);
    const empty = barLength - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const remaining = seconds - elapsed;
    process.stdout.write(`\r⏳ [${bar}] ${remaining}s tersisa `);
  }, 1000);

  await new Promise((r) => setTimeout(r, delay));
  clearInterval(barInterval);
  process.stdout.write(`\r⏳ [${"█".repeat(barLength)}] Selesai! ✅\n\n`);
}

async function runWallet(wallet, recipients, walletLabel) {
  const selected = pickRandomRecipients(recipients);
  console.log(`\n🔑 Wallet [${walletLabel}]: ${wallet.address}`);
  console.log(`🎲 Dipilih random: ${selected.length} address\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selected.length; i++) {
    const to = selected[i];
    const value = randomValue();
    process.stdout.write(`[${i + 1}/${selected.length}] → ${to} | ${value} ${SYMBOL} ... `);

    try {
      const tx = await sendToken(wallet, to, value);
      console.log(`✅ TX: ${tx.hash}`);
      successCount++;
    } catch (err) {
      console.log(`❌ Gagal: ${err.message}`);
      failCount++;
    }

    if (i < selected.length - 1) {
      await delayWithBar();
    }
  }

  console.log(`─────────────────────────────`);
  console.log(`✅ Sukses : ${successCount}`);
  console.log(`❌ Gagal  : ${failCount}`);
  console.log(`─────────────────────────────`);
}

async function main() {
  console.log("🚀 DACChain Testnet Auto Sender");
  console.log(`🌐 RPC: ${RPC_URL}`);
  console.log(`🔢 Chain ID: ${CHAIN_ID}`);
  console.log(`💎 Token: ${SYMBOL}`);
  console.log(`📊 Max value per tx: ${MAX_VALUE} ${SYMBOL}`);

  const wallets = loadWallets();
  if (wallets.length === 0) {
    console.error("❌ Tidak ada wallet valid di .env!");
    process.exit(1);
  }

  const recipients = loadRecipients();
  if (recipients.length === 0) {
    console.error("❌ Tidak ada address valid di recipients.txt!");
    process.exit(1);
  }

  console.log(`📋 Total address tersedia: ${recipients.length}`);

  const mode = await askMode(wallets);

  if (mode === "A") {
    // Jalanin semua wallet, mulai dari FIRST
    console.log(`\n🚀 Mode: Semua wallet (${wallets.length} wallet)\n`);
    for (const { index, wallet } of wallets) {
      await runWallet(wallet, recipients, index);
    }
    console.log("\n🎉 Semua wallet selesai!");
  } else {
    // Pilih satu wallet
    const wallet = await selectWallet(wallets);
    const label = wallets.find((w) => w.wallet.address === wallet.address)?.index;
    await runWallet(wallet, recipients, label);
  }
}

main().catch(console.error);
