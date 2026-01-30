# Deployment Guide

## Prerequisites

1. **Install Foundry**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. **Install Dependencies**
```bash
forge install foundry-rs/forge-std
```

3. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your values
```

## Testing

Run full test suite:
```bash
forge test
```

Run with verbosity:
```bash
forge test -vvv
```

Run specific test:
```bash
forge test --match-test testCreateJob
```

Generate gas report:
```bash
forge test --gas-report
```

## Deployment

### Base Sepolia (Testnet)

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

### Base Mainnet

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

## Post-Deployment

1. **Verify Contract** (if auto-verify failed):
```bash
forge verify-contract \
  <CONTRACT_ADDRESS> \
  contracts/AgentEscrow.sol:AgentEscrow \
  --chain-id <CHAIN_ID> \
  --constructor-args $(cast abi-encode "constructor(address)" <FEE_COLLECTOR>)
```

2. **Update README** with deployed address

3. **Test on-chain**:
```bash
# Create test job
cast send <CONTRACT_ADDRESS> \
  "createJob(address,uint256)" \
  <WORKER_ADDRESS> \
  <DEADLINE_TIMESTAMP> \
  --value 1ether \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

## Contract Verification

Contracts will be automatically verified on Basescan during deployment if `BASESCAN_API_KEY` is set.

Manual verification:
```bash
forge verify-contract \
  --chain-id 84532 \
  --watch \
  <CONTRACT_ADDRESS> \
  contracts/AgentEscrow.sol:AgentEscrow
```

## Security

- ✅ Run Slither before mainnet deployment:
  ```bash
  slither contracts/AgentEscrow.sol
  ```

- ✅ Review test coverage:
  ```bash
  forge coverage
  ```

- ✅ Audit logs before production use
