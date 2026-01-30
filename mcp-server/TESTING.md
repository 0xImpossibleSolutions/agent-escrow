# MCP Server Testing Guide

Guide for testing the agent-escrow MCP server before using in production.

## Prerequisites

1. **Base ETH Required:**
   - Minimum: 0.01 ETH (for gas + small test transactions)
   - Recommended: 0.02 ETH (for multiple test escrows)
   - Gas on Base: ~0.001-0.002 ETH per transaction

2. **Environment Setup:**
   ```bash
   export PRIVATE_KEY=0x...  # Your test wallet
   export CONTRACT_ADDRESS=0x9d249bB490348fAEd301a22Fe150959D21bC53eB
   export RPC_URL=https://mainnet.base.org
   ```

3. **Install Dependencies:**
   ```bash
   cd mcp-server
   npm install
   ```

## Test 1: Server Startup

Verify the server starts and lists tools:

```bash
cd mcp-server
PRIVATE_KEY=0x... node index.js <<EOF
{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
EOF
```

**Expected:** JSON response with 7 tools (create_escrow, submit_work, etc.)

**If fails:** Check PRIVATE_KEY is set and valid.

## Test 2: Query Job Status (Read-Only)

Test contract queries without spending gas:

```bash
cd mcp-server
PRIVATE_KEY=0x... node index.js <<EOF
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_job_status", "arguments": {"job_id": 0}}}
EOF
```

**Expected:** Either job details (if job 0 exists) or error "Job 0 does not exist"

**If fails:** Check CONTRACT_ADDRESS and RPC_URL are correct.

## Test 3: Create Escrow Job

Create a small test escrow (requires gas):

```bash
cd mcp-server
PRIVATE_KEY=0x... node index.js <<EOF
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "create_escrow", "arguments": {"worker_address": "0xYourTestAddress", "amount_eth": "0.001", "deadline_hours": 24}}}
EOF
```

**Expected:** Success with job_id and transaction hash

**Common errors:**
- "Insufficient funds" → Need more ETH (payment + ~0.002 ETH gas)
- "Invalid worker address" → Check worker address format
- Timeout → RPC issue, try again or use different RPC

## Test 4: Submit Work

After creating job, test work submission:

```bash
cd mcp-server
PRIVATE_KEY=0x... node index.js <<EOF
{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "submit_work", "arguments": {"job_id": 0, "deliverable": "ipfs://QmTest"}}}
EOF
```

**Expected:** Success with transaction hash

## Test 5: Approve Payment

As employer, approve the work:

```bash
cd mcp-server
PRIVATE_KEY=0x... node index.js <<EOF
{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "approve_work", "arguments": {"job_id": 0}}}
EOF
```

**Expected:** Success, worker receives 99%, fee collector 1%

## Test 6: Full Flow Test

Complete end-to-end test:

1. Create job (0.001 ETH, 24h deadline)
2. Query status → should show "Created"
3. Submit work (as worker)
4. Query status → should show "WorkSubmitted"
5. Approve work (as employer)
6. Query status → should show "Completed"

## Test 7: Cancel Flow

1. Create job with short deadline (1 hour)
2. Wait for deadline to pass
3. Cancel job
4. Query status → should show "Cancelled"
5. Verify refund received

## Test 8: Dispute Flow

1. Create job
2. Submit work
3. Dispute job
4. Query status → should show "Disputed"
5. Wait 7 days
6. Resolve dispute
7. Verify employer received refund

## Clawdbot Integration Test

After standalone tests pass, test with Clawdbot:

1. Add to `~/.config/clawdbot/config.yaml`:
   ```yaml
   mcpServers:
     agent-escrow:
       command: node
       args:
         - /path/to/agent-escrow/mcp-server/index.js
       env:
         PRIVATE_KEY: "0x..."
   ```

2. Restart Clawdbot: `clawdbot gateway restart`

3. Test via chat:
   ```
   "Create an escrow job for 0xYourAddress paying 0.001 ETH with 24 hour deadline"
   ```

4. Verify Clawdbot:
   - Calls create_escrow tool
   - Returns job ID and transaction link
   - Can query job status

## Common Issues

### "Insufficient funds"
- Check wallet balance: `cast balance <address> --rpc-url https://mainnet.base.org`
- Ensure: balance > (payment + 0.002 ETH gas buffer)

### Timeout / Hanging
- RPC may be slow or rate-limiting
- Try public RPCs: https://chainlist.org/chain/8453
- Or use paid RPC (Alchemy, Infura, QuickNode)

### "Cannot read properties of undefined"
- Job doesn't exist
- Check job_id is correct: `cast call 0x9d249bB490348fAEd301a22Fe150959D21bC53eB "nextJobId()" --rpc-url https://mainnet.base.org`

### "Only worker can submit"
- Wrong private key
- Transaction sent from employer address instead of worker

## Gas Costs (Base Mainnet)

Typical gas costs (as of 2026-01):
- Create job: ~0.0015 ETH
- Submit work: ~0.0008 ETH
- Approve work: ~0.0012 ETH
- Cancel: ~0.0008 ETH
- Dispute: ~0.0008 ETH

**Budget:** 0.01 ETH covers ~5-6 full escrow flows

## Success Criteria

MCP server is ready when:
- ✅ All 7 tools load correctly
- ✅ Query jobs without errors
- ✅ Create escrow returns job ID
- ✅ Submit work succeeds
- ✅ Approve releases payment correctly
- ✅ Clawdbot integration works via natural language

## Troubleshooting

If stuck, check:
1. `PRIVATE_KEY` is set and valid
2. Wallet has sufficient Base ETH
3. Contract address is correct (v1.1)
4. RPC URL is responsive
5. Base network is operational (https://status.base.org)

## Support

- GitHub Issues: https://github.com/0xImpossibleSolutions/agent-escrow/issues
- BaseScan: https://basescan.org/address/0x9d249bB490348fAEd301a22Fe150959D21bC53eB
