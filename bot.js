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
// ──────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name: "dacchain-testnet",
});

// Load semua wallet dari .env
function loadWallets() {
  const wallets = [];
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

// Load address penerima dari recipients.txt
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

// Random value antara min dan max (dalam DACC)
function randomValue(min = 0.001, max = MAX_VALUE) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(6));
}

// Prompt pilih wallet
async function selectWallet(wallets) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n📂 Wallet tersedia:");
  for (const { index, wallet } of wallets) {
    const balance = await provider.getBalance(wallet.address);
    const bal = ethers.formatEther(balance);
    console.log(`  [${index}] ${wallet.address} — ${parseFloat(bal).toFixed(4)} ${SYMBOL}`);
  }

  return new Promise((resolve) => {
    rl.question("\nPilih nomor wallet (contoh: 1): ", (answer) => {
      rl.close();
      const selected = wallets.find((w) => w.index === parseInt(answer));
      if (!selected) {
        console.error("❌ Pilihan tidak valid.");
        process.exit(1);
      }
      resolve(selected.wallet);
    });
  });
}

// Kirim transaksi
async function sendToken(wallet, to, valueEther) {
  const tx = await wallet.sendTransaction({
    to,
    value: ethers.parseEther(valueEther.toString()),
  });
  return tx;
}

// ─── MAIN ────────────────────────────────────────────────
async function main() {
  console.log("🚀 DACChain Testnet Auto Sender");
  console.log(`🌐 RPC: ${RPC_URL}`);
  console.log(`🔢 Chain ID: ${CHAIN_ID}`);
  console.log(`💎 Token: ${SYMBOL}`);
  console.log(`📊 Max value per tx: ${MAX_VALUE} ${SYMBOL}\n`);

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

  console.log(`📋 Total penerima: ${recipients.length} address`);

  const wallet = await selectWallet(wallets);
  console.log(`\n✅ Wallet dipilih: ${wallet.address}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const value = randomValue();
    process.stdout.write(`[${i + 1}/${recipients.length}] → ${to} | ${value} ${SYMBOL} ... `);

    try {
      const tx = await sendToken(wallet, to, value);
      console.log(`✅ TX: ${tx.hash}`);
      successCount++;

      // Delay 1 detik antar tx biar ga kena rate limit
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.log(`❌ Gagal: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`✅ Sukses : ${successCount}`);
  console.log(`❌ Gagal  : ${failCount}`);
  console.log(`─────────────────────────────`);
}

main().catch(console.error);
