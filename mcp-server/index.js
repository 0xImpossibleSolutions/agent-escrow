#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract configuration
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x9d249bB490348fAEd301a22Fe150959D21bC53eB';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY environment variable is required');
  process.exit(1);
}

// Contract ABI (only the functions we need)
const ESCROW_ABI = [
  {
    "inputs": [{"type": "address", "name": "worker"}, {"type": "uint256", "name": "deadline"}],
    "name": "createJob",
    "outputs": [{"type": "uint256", "name": "jobId"}],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "jobId"}, {"type": "string", "name": "deliverable"}],
    "name": "submitWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "jobId"}],
    "name": "approveWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "jobId"}],
    "name": "cancelJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "jobId"}],
    "name": "dispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "jobId"}],
    "name": "resolveDisputedJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "jobId"}],
    "name": "getJob",
    "outputs": [
      {
        "type": "tuple",
        "components": [
          {"type": "address", "name": "employer"},
          {"type": "address", "name": "worker"},
          {"type": "uint256", "name": "amount"},
          {"type": "uint256", "name": "deadline"},
          {"type": "uint8", "name": "status"},
          {"type": "string", "name": "deliverable"},
          {"type": "uint256", "name": "createdAt"}
        ]
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const STATUS_NAMES = {
  0: 'Created',
  1: 'WorkSubmitted',
  2: 'Completed',
  3: 'Disputed',
  4: 'Cancelled'
};

// Setup clients
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

// MCP Server
const server = new Server(
  {
    name: "agent-escrow",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_escrow",
        description: "Create a new escrow job on Base. Deposits payment and creates job for specified worker.",
        inputSchema: {
          type: "object",
          properties: {
            worker_address: {
              type: "string",
              description: "Ethereum address of the worker who will perform the job (0x...)"
            },
            amount_eth: {
              type: "string",
              description: "Payment amount in ETH (e.g., '0.01')"
            },
            deadline_hours: {
              type: "number",
              description: "Number of hours from now until job expires (e.g., 24 for 1 day)"
            }
          },
          required: ["worker_address", "amount_eth", "deadline_hours"]
        }
      },
      {
        name: "submit_work",
        description: "Submit completed work for an escrow job. Provides deliverable reference (IPFS hash, GitHub link, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "number",
              description: "The escrow job ID"
            },
            deliverable: {
              type: "string",
              description: "Reference to completed work (IPFS hash, GitHub URL, etc.)"
            }
          },
          required: ["job_id", "deliverable"]
        }
      },
      {
        name: "approve_work",
        description: "Approve completed work and release payment. Worker receives 99%, service fee 1%.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "number",
              description: "The escrow job ID to approve"
            }
          },
          required: ["job_id"]
        }
      },
      {
        name: "cancel_job",
        description: "Cancel an expired job and get refund. Only works if deadline passed and no work submitted.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "number",
              description: "The escrow job ID to cancel"
            }
          },
          required: ["job_id"]
        }
      },
      {
        name: "dispute_job",
        description: "Raise a dispute for a job. Sets 7-day resolution period.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "number",
              description: "The escrow job ID to dispute"
            }
          },
          required: ["job_id"]
        }
      },
      {
        name: "resolve_dispute",
        description: "Resolve a disputed job after 7-day timeout. Employer can reclaim funds.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "number",
              description: "The disputed job ID to resolve"
            }
          },
          required: ["job_id"]
        }
      },
      {
        name: "get_job_status",
        description: "Get current status and details of an escrow job.",
        inputSchema: {
          type: "object",
          properties: {
            job_id: {
              type: "number",
              description: "The escrow job ID to query"
            }
          },
          required: ["job_id"]
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "create_escrow": {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + (args.deadline_hours * 3600));
        const value = parseEther(args.amount_eth);

        const { request: txRequest } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'createJob',
          args: [args.worker_address, deadline],
          value,
          account
        });

        const hash = await walletClient.writeContract(txRequest);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Parse job ID from logs
        const jobId = receipt.logs[0]?.topics[1] ? Number(receipt.logs[0].topics[1]) : 'unknown';

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              job_id: jobId,
              tx_hash: hash,
              worker: args.worker_address,
              amount: args.amount_eth + ' ETH',
              deadline: new Date(Number(deadline) * 1000).toISOString(),
              explorer: `https://basescan.org/tx/${hash}`
            }, null, 2)
          }]
        };
      }

      case "submit_work": {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'submitWork',
          args: [BigInt(args.job_id), args.deliverable],
          account
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              job_id: args.job_id,
              deliverable: args.deliverable,
              tx_hash: hash,
              explorer: `https://basescan.org/tx/${hash}`
            }, null, 2)
          }]
        };
      }

      case "approve_work": {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'approveWork',
          args: [BigInt(args.job_id)],
          account
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              job_id: args.job_id,
              status: 'Payment released to worker',
              tx_hash: hash,
              explorer: `https://basescan.org/tx/${hash}`
            }, null, 2)
          }]
        };
      }

      case "cancel_job": {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'cancelJob',
          args: [BigInt(args.job_id)],
          account
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              job_id: args.job_id,
              status: 'Job cancelled, refund issued',
              tx_hash: hash,
              explorer: `https://basescan.org/tx/${hash}`
            }, null, 2)
          }]
        };
      }

      case "dispute_job": {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'dispute',
          args: [BigInt(args.job_id)],
          account
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              job_id: args.job_id,
              status: 'Dispute raised - 7 day resolution period started',
              tx_hash: hash,
              explorer: `https://basescan.org/tx/${hash}`
            }, null, 2)
          }]
        };
      }

      case "resolve_dispute": {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'resolveDisputedJob',
          args: [BigInt(args.job_id)],
          account
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              job_id: args.job_id,
              status: 'Dispute resolved, funds returned to employer',
              tx_hash: hash,
              explorer: `https://basescan.org/tx/${hash}`
            }, null, 2)
          }]
        };
      }

      case "get_job_status": {
        const job = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'getJob',
          args: [BigInt(args.job_id)]
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              job_id: args.job_id,
              employer: job[0],
              worker: job[1],
              amount: formatEther(job[2]) + ' ETH',
              deadline: new Date(Number(job[3]) * 1000).toISOString(),
              status: STATUS_NAMES[job[4]] || 'Unknown',
              deliverable: job[5] || '(none)',
              created_at: new Date(Number(job[6]) * 1000).toISOString()
            }, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error.message,
          details: error.cause?.message || error.toString()
        }, null, 2)
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Agent Escrow MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
