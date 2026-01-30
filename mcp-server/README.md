# Agent Escrow MCP Server

Model Context Protocol (MCP) server for interacting with the agent-escrow smart contract on Base.

Enables AI agents (Clawdbot, Claude Desktop, etc.) to autonomously create escrow jobs, submit work, approve payments, and manage disputes.

## Installation

```bash
cd mcp-server
npm install
```

## Configuration

### Environment Variables

```bash
# Required: Your wallet private key
export PRIVATE_KEY=0x...

# Optional: Custom contract address (defaults to deployed v1.1)
export CONTRACT_ADDRESS=0x9d249bB490348fAEd301a22Fe150959D21bC53eB

# Optional: Custom RPC URL (defaults to Base mainnet)
export RPC_URL=https://mainnet.base.org
```

### For Clawdbot

Add to your `~/.config/clawdbot/config.yaml`:

```yaml
mcpServers:
  agent-escrow:
    command: node
    args:
      - /path/to/agent-escrow/mcp-server/index.js
    env:
      PRIVATE_KEY: "0x..."  # Your wallet private key
```

Restart Clawdbot gateway:
```bash
clawdbot gateway restart
```

### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-escrow": {
      "command": "node",
      "args": ["/path/to/agent-escrow/mcp-server/index.js"],
      "env": {
        "PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Available Tools

### `create_escrow`
Create a new escrow job.

**Parameters:**
- `worker_address` (string): Ethereum address of worker (0x...)
- `amount_eth` (string): Payment amount in ETH (e.g., "0.01")
- `deadline_hours` (number): Hours until job expires (e.g., 24)

**Example:**
```json
{
  "worker_address": "0x742E91Cd0FF12E1c850C118F0e22cDdA69f994D5",
  "amount_eth": "0.01",
  "deadline_hours": 48
}
```

### `submit_work`
Submit completed work for a job.

**Parameters:**
- `job_id` (number): The escrow job ID
- `deliverable` (string): IPFS hash, GitHub URL, or work reference

**Example:**
```json
{
  "job_id": 0,
  "deliverable": "ipfs://QmYourHashHere"
}
```

### `approve_work`
Approve work and release payment to worker.

**Parameters:**
- `job_id` (number): The escrow job ID

**Example:**
```json
{
  "job_id": 0
}
```

### `cancel_job`
Cancel expired job and get refund (only if deadline passed + no work submitted).

**Parameters:**
- `job_id` (number): The escrow job ID

### `dispute_job`
Raise a dispute (sets 7-day resolution period).

**Parameters:**
- `job_id` (number): The escrow job ID

### `resolve_dispute`
Resolve dispute after 7 days (employer only, returns funds).

**Parameters:**
- `job_id` (number): The disputed job ID

### `get_job_status`
Query current job status and details.

**Parameters:**
- `job_id` (number): The escrow job ID

**Returns:**
```json
{
  "job_id": 0,
  "employer": "0x...",
  "worker": "0x...",
  "amount": "0.01 ETH",
  "deadline": "2026-02-01T12:00:00.000Z",
  "status": "Created",
  "deliverable": "(none)",
  "created_at": "2026-01-30T12:00:00.000Z"
}
```

## Job Status Values

- `Created` - Job created, waiting for work
- `WorkSubmitted` - Worker submitted deliverable
- `Completed` - Employer approved, payment sent
- `Disputed` - Dispute raised, 7-day resolution period
- `Cancelled` - Job cancelled, refund issued

## Usage Example (Clawdbot)

Once configured, agents can use natural language:

```
"Create an escrow job for 0x742E91Cd0FF12E1c850C118F0e22cDdA69f994D5 
paying 0.05 ETH with a 72 hour deadline"
```

Clawdbot will call `create_escrow` and return the job ID.

## Security Notes

⚠️ **PRIVATE_KEY Security:**
- Never commit your private key to version control
- Use environment variables or secure key management
- Consider using a dedicated wallet for agent operations
- Only fund with amounts you're willing to use autonomously

⚠️ **Contract Security:**
- Contract is NOT professionally audited
- Use small amounts for testing
- Verify transactions on BaseScan before large payments

## Troubleshooting

### "PRIVATE_KEY environment variable is required"
Set your wallet private key:
```bash
export PRIVATE_KEY=0x...
```

### "Insufficient funds"
Ensure your wallet has enough ETH on Base for:
- Job payment amount
- Gas fees (usually < $0.01)

### "Deadline must be in future"
Deadline is calculated from current time. Make sure `deadline_hours` is positive.

### Check job status
Use `get_job_status` tool to verify job state before actions.

## Development

Run directly:
```bash
PRIVATE_KEY=0x... node index.js
```

The server communicates via stdio (Model Context Protocol).

## Links

- Contract: https://basescan.org/address/0x9d249bB490348fAEd301a22Fe150959D21bC53eB
- Repository: https://github.com/0xImpossibleSolutions/agent-escrow
- MCP SDK: https://github.com/modelcontextprotocol/sdk
