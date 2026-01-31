#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
// Config
const PORT = process.env.PORT || 3402;
const CONTRACT_ADDRESS = '0x9d249bB490348fAEd301a22Fe150959D21bC53eB';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS; // Where x402 payments go

if (!PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY required');
  process.exit(1);
}

// Contract ABI
const ESCROW_ABI = [
  {
    inputs: [{type: "address", name: "worker"}, {type: "uint256", name: "deadline"}],
    name: "createJob",
    outputs: [{type: "uint256", name: "jobId"}],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [{type: "uint256", name: "jobId"}, {type: "string", name: "deliverable"}],
    name: "submitWork",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{type: "uint256", name: "jobId"}],
    name: "approveWork",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{type: "uint256", name: "jobId"}],
    name: "cancelJob",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{type: "uint256", name: "jobId"}],
    name: "disputeJob",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{type: "uint256", name: "jobId"}],
    name: "resolveDispute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{type: "uint256", name: ""}],
    name: "jobs",
    outputs: [
      {type: "address", name: "employer"},
      {type: "address", name: "worker"},
      {type: "uint256", name: "amount"},
      {type: "uint256", name: "deadline"},
      {type: "uint8", name: "status"},
      {type: "string", name: "deliverable"},
      {type: "uint256", name: "disputeTime"}
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "jobCount",
    outputs: [{type: "uint256"}],
    stateMutability: "view",
    type: "function"
  }
];

// Clients
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL)
});
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(RPC_URL)
});

const app = express();
app.use(cors());
app.use(express.json());

// x402 payments will be added in v1.1 using sigwei.com x402-hub
console.log('ℹ️  x402 payments: Coming in v1.1');

// === FREE ENDPOINTS ===

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'agent-escrow API',
    version: '1.0.0',
    contract: CONTRACT_ADDRESS,
    network: 'Base Mainnet',
    x402: 'v1.1',
    docs: 'https://github.com/0xImpossibleSolutions/agent-escrow'
  });
});

// Get job status (free)
app.get('/job/:id', async (req, res) => {
  try {
    const jobId = BigInt(req.params.id);
    
    const job = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'jobs',
      args: [jobId]
    });

    const statusMap = ['Created', 'WorkSubmitted', 'Completed', 'Cancelled', 'Disputed'];
    
    res.json({
      jobId: jobId.toString(),
      employer: job[0],
      worker: job[1],
      amount: formatEther(job[2]),
      deadline: new Date(Number(job[3]) * 1000).toISOString(),
      status: statusMap[job[4]],
      deliverable: job[5],
      disputeTime: job[6] > 0 ? new Date(Number(job[6]) * 1000).toISOString() : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get total job count (free)
app.get('/jobs/count', async (req, res) => {
  try {
    const count = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'jobCount'
    });
    res.json({ count: count.toString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === PAID ENDPOINTS (x402) ===

// Create job
app.post('/job/create', async (req, res) => {
  try {
    const { worker, deadline, amount } = req.body;
    
    if (!worker || !deadline || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: worker, deadline, amount' 
      });
    }

    const deadlineTimestamp = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
    const amountWei = parseEther(amount.toString());

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'createJob',
      args: [worker, deadlineTimestamp],
      value: amountWei
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    // Get job ID from logs
    const jobId = receipt.logs[0]?.data ? BigInt(receipt.logs[0].data) : null;

    res.json({
      success: true,
      jobId: jobId?.toString(),
      txHash: hash,
      explorer: `https://basescan.org/tx/${hash}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit work
app.post('/job/:id/submit', async (req, res) => {
  try {
    const jobId = BigInt(req.params.id);
    const { deliverable } = req.body;

    if (!deliverable) {
      return res.status(400).json({ error: 'Missing deliverable' });
    }

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'submitWork',
      args: [jobId, deliverable]
    });

    await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      success: true,
      txHash: hash,
      explorer: `https://basescan.org/tx/${hash}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve work
app.post('/job/:id/approve', async (req, res) => {
  try {
    const jobId = BigInt(req.params.id);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'approveWork',
      args: [jobId]
    });

    await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      success: true,
      txHash: hash,
      explorer: `https://basescan.org/tx/${hash}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
app.post('/job/:id/cancel', async (req, res) => {
  try {
    const jobId = BigInt(req.params.id);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'cancelJob',
      args: [jobId]
    });

    await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      success: true,
      txHash: hash,
      explorer: `https://basescan.org/tx/${hash}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dispute job
app.post('/job/:id/dispute', async (req, res) => {
  try {
    const jobId = BigInt(req.params.id);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'disputeJob',
      args: [jobId]
    });

    await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      success: true,
      txHash: hash,
      explorer: `https://basescan.org/tx/${hash}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve dispute
app.post('/job/:id/resolve', async (req, res) => {
  try {
    const jobId = BigInt(req.params.id);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'resolveDispute',
      args: [jobId]
    });

    await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      success: true,
      txHash: hash,
      explorer: `https://basescan.org/tx/${hash}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 agent-escrow API running on port ${PORT}`);
  console.log(`📝 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`🌐 Network: Base Mainnet`);
  console.log(`💰 x402: Coming in v1.1 (via sigwei.com)`);
});
