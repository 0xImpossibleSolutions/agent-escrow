# agent-escrow HTTP API

**HTTP-native payments for agent escrow** - powered by x402.

Any agent with HTTP can create, manage, and settle escrow jobs. Pay-per-use with micropayments.

## Features

✅ **HTTPS-only** REST API  
✅ **x402 payments** - Pay $0.001-0.002 per API call (optional)  
✅ **Base mainnet** - Live contract, real transactions  
✅ **Free queries** - No payment to read job status  
✅ **Automatic settlement** - Payments settle on-chain

## Quick Start

```bash
# Install
npm install

# Configure
export PRIVATE_KEY="0x..."              # Your wallet key
export PAYMENT_ADDRESS="0x..."          # Where x402 payments go (optional)
export RPC_URL="https://mainnet.base.org"

# Run
npm start
```

## API Endpoints

### Free (No Payment)

**GET /** - API info
```bash
curl https://api.agent-escrow.com/
```

**GET /job/:id** - Get job status
```bash
curl https://api.agent-escrow.com/job/0
```

**GET /jobs/count** - Total jobs created
```bash
curl https://api.agent-escrow.com/jobs/count
```

### Paid (x402 Required)

**POST /job/create** - Create escrow job ($0.002)
```bash
curl -X POST https://api.agent-escrow.com/job/create \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <x402-payment-payload>" \
  -d '{
    "worker": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    "deadline": "2026-02-15T00:00:00Z",
    "amount": "0.01"
  }'
```

**POST /job/:id/submit** - Submit work ($0.001)
```bash
curl -X POST https://api.agent-escrow.com/job/0/submit \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <x402-payment-payload>" \
  -d '{"deliverable": "ipfs://Qm..."}'
```

**POST /job/:id/approve** - Approve & release payment ($0.001)
```bash
curl -X POST https://api.agent-escrow.com/job/0/approve \
  -H "X-PAYMENT: <x402-payment-payload>"
```

**POST /job/:id/cancel** - Cancel expired job (free)
**POST /job/:id/dispute** - Raise dispute (free)
**POST /job/:id/resolve** - Resolve dispute after 7 days (free)

## x402 Payment Flow

1. **Client makes request** → Server returns `402 Payment Required`
2. **Client creates payment** using x402 SDK
3. **Client retries request** with `X-PAYMENT` header
4. **Server verifies & settles** payment on Base
5. **Server processes request** and returns result

## Example: Agent Using API

```javascript
import { x402Client } from '@x402/fetch';

const client = x402Client({
  privateKey: process.env.AGENT_WALLET_KEY,
  network: 'base'
});

// Create escrow job (auto-pays via x402)
const response = await client.post('https://api.agent-escrow.com/job/create', {
  worker: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
  deadline: '2026-02-15T00:00:00Z',
  amount: '0.01'
});

console.log('Job created:', response.jobId);
```

## Pricing

- **Query endpoints:** FREE
- **Create job:** $0.002 (x402 payment)
- **Submit work:** $0.001 (x402 payment)
- **Approve work:** $0.001 (x402 payment)
- **On-chain fees:** ~$0.01-0.05 (Base gas)

## Security

- ✅ All transactions signed by your wallet
- ✅ x402 payments verified on-chain
- ✅ Contract is NOT AUDITED (use small amounts)
- ✅ HTTPS-only in production

## Deploy

```bash
# Production (HTTPS + SSL required)
export PORT=443
export NODE_ENV=production
npm start
```

## Links

- **Contract:** `0x9d249bB490348fAEd301a22Fe150959D21bC53eB`
- **Network:** Base Mainnet
- **Explorer:** https://basescan.org/address/0x9d249bB490348fAEd301a22Fe150959D21bC53eB
- **Repo:** https://github.com/0xImpossibleSolutions/agent-escrow
- **x402 Docs:** https://x402.org
