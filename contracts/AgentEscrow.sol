// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentEscrow
 * @notice Simple escrow protocol for agent-to-agent payments
 * @dev Enables autonomous job creation, work submission, and payment release
 */
contract AgentEscrow {
    enum JobStatus {
        Created,
        WorkSubmitted,
        Completed,
        Disputed,
        Cancelled
    }

    struct Job {
        address employer;        // Agent who creates the job
        address worker;          // Agent who accepts the job
        uint256 amount;          // Payment amount in wei
        uint256 deadline;        // Timestamp when job expires
        JobStatus status;        // Current job state
        string deliverable;      // IPFS hash or deliverable reference
        uint256 createdAt;       // Job creation timestamp
    }

    // Job storage
    mapping(uint256 => Job) public jobs;
    uint256 public nextJobId;

    // Service fee (1% = 100 basis points)
    uint256 public constant SERVICE_FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10000;
    address public feeCollector;

    // Events
    event JobCreated(uint256 indexed jobId, address indexed employer, address indexed worker, uint256 amount, uint256 deadline);
    event WorkSubmitted(uint256 indexed jobId, string deliverable);
    event JobCompleted(uint256 indexed jobId, address worker, uint256 amount);
    event JobCancelled(uint256 indexed jobId, address employer, uint256 refund);
    event JobDisputed(uint256 indexed jobId, address indexed disputer);

    constructor(address _feeCollector) {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
    }

    /**
     * @notice Create a new escrow job
     * @param worker Address of the agent who will perform work
     * @param deadline Unix timestamp when job expires
     * @return jobId The created job ID
     */
    function createJob(address worker, uint256 deadline) external payable returns (uint256) {
        require(worker != address(0), "Invalid worker address");
        require(worker != msg.sender, "Cannot hire yourself");
        require(msg.value > 0, "Payment required");
        require(deadline > block.timestamp, "Deadline must be in future");

        uint256 jobId = nextJobId++;

        jobs[jobId] = Job({
            employer: msg.sender,
            worker: worker,
            amount: msg.value,
            deadline: deadline,
            status: JobStatus.Created,
            deliverable: "",
            createdAt: block.timestamp
        });

        emit JobCreated(jobId, msg.sender, worker, msg.value, deadline);
        return jobId;
    }

    /**
     * @notice Worker submits completed work
     * @param jobId The job ID
     * @param deliverable IPFS hash or reference to work
     */
    function submitWork(uint256 jobId, string calldata deliverable) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.worker, "Only worker can submit");
        require(job.status == JobStatus.Created, "Invalid job status");
        require(block.timestamp <= job.deadline, "Job expired");
        require(bytes(deliverable).length > 0, "Deliverable required");

        job.deliverable = deliverable;
        job.status = JobStatus.WorkSubmitted;

        emit WorkSubmitted(jobId, deliverable);
    }

    /**
     * @notice Employer approves work and releases payment
     * @param jobId The job ID
     */
    function approveWork(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer, "Only employer can approve");
        require(job.status == JobStatus.WorkSubmitted, "Work not submitted");

        job.status = JobStatus.Completed;

        // Calculate fee and payment
        uint256 fee = (job.amount * SERVICE_FEE_BPS) / BPS_DENOMINATOR;
        uint256 payment = job.amount - fee;

        // Transfer payment to worker
        (bool successWorker, ) = job.worker.call{value: payment}("");
        require(successWorker, "Payment failed");

        // Transfer fee to collector
        (bool successFee, ) = feeCollector.call{value: fee}("");
        require(successFee, "Fee transfer failed");

        emit JobCompleted(jobId, job.worker, payment);
    }

    /**
     * @notice Cancel job if deadline passed without work submission
     * @param jobId The job ID
     */
    function cancelJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer, "Only employer can cancel");
        require(job.status == JobStatus.Created, "Invalid job status");
        require(block.timestamp > job.deadline, "Deadline not passed");

        job.status = JobStatus.Cancelled;

        // Refund employer
        (bool success, ) = job.employer.call{value: job.amount}("");
        require(success, "Refund failed");

        emit JobCancelled(jobId, job.employer, job.amount);
    }

    /**
     * @notice Raise a dispute
     * @param jobId The job ID
     * @dev Sets 7-day timeout for dispute resolution. After timeout, employer can reclaim funds.
     */
    function dispute(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(
            msg.sender == job.employer || msg.sender == job.worker,
            "Only parties can dispute"
        );
        require(
            job.status == JobStatus.Created || job.status == JobStatus.WorkSubmitted,
            "Cannot dispute completed/cancelled job"
        );

        job.status = JobStatus.Disputed;
        job.deadline = block.timestamp + 7 days; // Set dispute resolution deadline
        emit JobDisputed(jobId, msg.sender);
    }

    /**
     * @notice Resolve dispute after timeout (7 days)
     * @param jobId The job ID
     * @dev After dispute timeout, employer can reclaim funds
     */
    function resolveDisputedJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Disputed, "Job not disputed");
        require(msg.sender == job.employer, "Only employer can resolve");
        require(block.timestamp > job.deadline, "Dispute period not ended");

        job.status = JobStatus.Cancelled;

        // Refund employer (no fee charged for disputed jobs)
        (bool success, ) = job.employer.call{value: job.amount}("");
        require(success, "Refund failed");

        emit JobCancelled(jobId, job.employer, job.amount);
    }

    /**
     * @notice Get job details
     * @param jobId The job ID
     */
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
